// Against a real database: the owner's saved wording reaches real emails and texts through the one render path, the
// generated parts (links) stay, and "send me a test" carries the editor's wording through the outbox.
import { afterAll, describe, expect, it } from "vitest";
import { business, db } from "@/server/db";
import { enqueue, renderMessage } from "@/server/email/outbox";
import { renderSms } from "@/server/email/sms-templates";

const keys = ["hub.link", "sms.referral_thanks"];
afterAll(async () => { await db.emailTemplateOverride.deleteMany({ where: { template: { in: keys } } }); });

describe("message wording", () => {
  it("applies the saved subject and opening to a real email, and only to that template", async () => {
    const biz = await business();
    const client = await db.client.create({ data: { businessId: biz.id, firstName: "Wanda", lastName: "Wording", email: "wanda-wording@example.com", source: "MANUAL" } });
    const mail = { template: "hub.link", props: { clientId: client.id }, businessId: biz.id, to: client.email };
    const before = await renderMessage(mail);
    expect(before.subject).toBeNull(); // the subject stored when it was queued is used
    expect(before.text).toContain("See upcoming visits");

    await db.emailTemplateOverride.create({ data: { businessId: biz.id, template: "hub.link", subject: "{{first_name}}, your page at {{business_name}}", intro: "Everything in one place, {{first_name}}.\n\nCall {{business_phone}} any time. {{invoice_number}}" } });
    const after = await renderMessage(mail);
    expect(after.subject).toBe(`Wanda, your page at ${biz.name}`);
    expect(after.text).toContain("Everything in one place, Wanda.");
    expect(after.text).not.toContain("See upcoming visits");
    expect(after.text).not.toContain("{{");
    expect(after.html).toMatch(/href="[^"]+\/hub\/[^"]+"/); // the button still goes to their page

    const other = await renderMessage({ template: "review.request", props: { clientId: client.id }, businessId: biz.id, to: client.email });
    expect(other.subject).toBeNull();
    expect(other.text).toContain("a quick Google review");

    await db.emailTemplateOverride.update({ where: { businessId_template: { businessId: biz.id, template: "hub.link" } }, data: { enabled: false } });
    expect((await renderMessage(mail)).text).toContain("See upcoming visits");
  });

  it("queues a test email with the wording from the editor, saved or not", async () => {
    const biz = await business();
    const m = await enqueue(db, { businessId: biz.id, template: "owner.template_test", to: "owner@example.com", props: { template: "invoice.sent", wording: { subject: "Invoice {{invoice_number}} for {{first_name}}", intro: "You owe {{balance}}." } } });
    expect(m!.subject).toBe("Test: Your invoice from etc.");
    const out = await renderMessage(m!);
    expect(out.subject).toBe("Test: Invoice 1042 for Sam");
    expect(out.text).toContain("You owe $45.");
    await db.emailMessage.delete({ where: { id: m!.id } });
  });

  it("applies saved wording to a text and puts the required part back", async () => {
    const biz = await business();
    const client = await db.client.create({ data: { businessId: biz.id, firstName: "Tex", lastName: "Wording", email: "tex-wording@example.com", source: "MANUAL" } });
    const send = () => renderSms("sms.referral_thanks", { clientId: client.id, cents: 1000 }, { businessId: biz.id });
    expect(await send()).toBe("Thanks for sending a neighbour our way, Tex! $10 off your next etc. invoice. - etc.");
    await db.emailTemplateOverride.create({ data: { businessId: biz.id, template: "sms.referral_thanks", body: "Cheers {{first_name}}: {{amount}} off next time." } });
    expect(await send()).toBe("Cheers Tex: $10 off next time. - etc.");
    // Texts the owner can't reword are untouched.
    expect(await renderSms("sms.opt_in", {}, { businessId: biz.id })).toBe("You're signed up for etc. booking texts. Reply STOP to stop, HELP for help.");
  });
});
