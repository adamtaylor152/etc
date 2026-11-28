// Settings › Messages: the owner's wording and branding. With nothing set, every email is byte-for-byte the built-in
// one; with wording set, it is filled, escaped, and the generated parts stay.
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { mailStore, type Mail } from "@/emails/ui";
import { brandColorError, contrast } from "@/server/brand";
import { samples } from "@/server/email/samples";
import { templates } from "@/server/email/templates";
import { allowedVars, EMAIL_META, fill, SMS_META, smsText, unknownVars, withRequired, type EmailKey, type SmsKey } from "@/server/email/wording";
import { SettingsSchema } from "@/server/settings";

const withMail = (k: EmailKey, mail: Mail) => mailStore.run(mail, () => render(samples()[k].el));
const emails = Object.keys(EMAIL_META) as EmailKey[];

describe("variables", () => {
  it("fills known ones, drops unknown ones, and never reads a value as a variable", () => {
    expect(fill("Hi {{first_name}}, {{ balance }} is due{{nope}}.", { first_name: "Sam", balance: "$45" })).toBe("Hi Sam, $45 is due.");
    expect(fill("{{a}}", { a: "{{b}}", b: "x" })).toBe("{{b}}");
    expect(fill("{first_name} {{First_Name}}", { first_name: "Sam" })).toBe("{first_name} {{First_Name}}"); // not our syntax: left alone
  });
  it("flags the ones a message can't supply", () => {
    expect(unknownVars("{{first_name}} {{invoice_number}} {{frist_name}} {{frist_name}}", allowedVars("invoice.sent"))).toEqual(["frist_name"]);
    expect(unknownVars("{{invoice_number}}", allowedVars("quote.sent"))).toEqual(["invoice_number"]);
  });
});

describe("email wording", () => {
  it("covers every client email, and nothing sent to the owner or team", () => {
    const fixed = ["campaign.email", "crew.assignment"]; // own composer; team notice
    expect(Object.keys(templates).filter((k) => !k.startsWith("owner.") && !fixed.includes(k)).sort()).toEqual([...emails].sort());
  });

  it.each(emails)("%s: unchanged with nothing set, the owner's words when set", async (k) => {
    const builtIn = await render(samples()[k].el);
    const mail: Mail = { vars: {} };
    expect(await withMail(k, mail)).toBe(builtIn);
    for (const v of EMAIL_META[k].vars) expect(mail.vars[v], `${k} supplies {{${v}}}`).toBeTypeOf("string");
    expect(mail.vars.first_name).toBe("Sam");

    const html = await withMail(k, { intro: "Hello {{first_name}} & co <script>alert(1)</script>\nsecond line\n\nNew paragraph {{nope}}.", closing: "Bye <b>now</b>", vars: {} });
    expect(html).toContain("Hello Sam &amp; co &lt;script&gt;alert(1)&lt;/script&gt;</span><span><br/>second line");
    expect(html).toContain("New paragraph .</span></p>");
    expect(html).not.toContain("<script>alert");
    expect(html.includes("Bye &lt;b&gt;now&lt;/b&gt;")).toBe("closing" in EMAIL_META[k]);
    // The generated parts are still there: same links, same footer.
    const links = (s: string) => [...s.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(links(html)).toEqual(links(builtIn));
    expect(html).toContain("Questions? Call");
  });

  it("keeps two emails rendering at once apart", async () => {
    const [a, b] = await Promise.all([withMail("hub.link", { intro: "AAA {{first_name}}", vars: {} }), withMail("review.request", { intro: "BBB", color: "#aa0000", vars: {} })]);
    expect(a).toContain("AAA Sam"); expect(a).not.toContain("BBB"); expect(a).not.toContain("#aa0000");
    expect(b).toContain("BBB"); expect(b).toContain("#aa0000");
  });

  it("puts the logo and colour on the header and buttons", async () => {
    const html = await withMail("hub.link", { color: "#0a7d33", logoUrl: "https://crm.test/api/media/x/logo?sig=1", business: "Acme Yard", vars: {} });
    expect(html).toContain('<img src="https://crm.test/api/media/x/logo?sig=1" alt="Acme Yard"');
    expect(html).toContain('bgcolor="#0a7d33"');
    expect(html).not.toContain("#1d6fd8");
  });
});

describe("text wording", () => {
  it("built-in texts already have their required parts and only use their own variables", () => {
    for (const k of Object.keys(SMS_META) as SmsKey[]) {
      expect(withRequired(SMS_META[k].text, k), k).toEqual({ body: SMS_META[k].text, added: [] });
      expect(unknownVars(SMS_META[k].text, allowedVars(k)), k).toEqual([]);
    }
  });
  it("sends the built-in text when there is no wording of the owner's", () => {
    expect(smsText("sms.on_my_way", null, { first_name: "Sam", address: "12 Elm St", arrival: "" })).toBe("Hi Sam, the etc. crew is on the way to 12 Elm St. No need to be home. - etc. (Reply STOP to opt out)");
    expect(smsText("sms.quote", "  ", { first_name: "Sam", quote_title: "Yard", total: "$180", link: "https://x/q/1" })).toBe("Hi Sam, your etc. quote for Yard ($180) is ready. See and approve it here: https://x/q/1 - etc.");
  });
  it("puts back the link, who it's from and the opt-out when the owner's wording drops them", () => {
    expect(withRequired("We're coming, {{first_name}}!", "sms.on_my_way")).toEqual({ body: "We're coming, {{first_name}}! - etc. (Reply STOP to opt out)", added: ["who it's from", "how to opt out"] });
    expect(smsText("sms.visit_done", "Finished at {{address}}.", { address: "12 Elm St", link: "https://x/v/1" })).toBe("Finished at 12 Elm St. https://x/v/1 - etc.");
    // Already there (in the owner's own words): nothing is added.
    expect(withRequired("Done! Photos: {{ link }} Thanks, {{business_name}}", "sms.visit_done").added).toEqual([]);
    expect(withRequired("On the way. etc. crew. Reply STOP to end", "sms.on_my_way").added).toEqual([]);
  });
});

describe("brand colour", () => {
  it("measures contrast like WCAG", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#ffffff")).toBe(1);
    expect(contrast("#1d6fd8", "#ffffff")).toBeGreaterThan(4.5); // etc. blue passes its own rule
  });
  it("refuses colours white text can't be read on, and things that aren't colours", () => {
    expect(brandColorError("#0a7d33")).toBeNull();
    expect(brandColorError("#ffd400")).toMatch(/too light/);
    expect(brandColorError("#7cb8ff")).toMatch(/too light/);
    expect(brandColorError("red")).toMatch(/#1d6fd8/);
    expect(brandColorError("#12345")).toMatch(/#1d6fd8/);
  });
  it("settings default to the etc. look and the four quick replies", () => {
    const s = SettingsSchema.parse({});
    expect([s.brandColor, s.logoId, s.quickReplies.length]).toEqual([null, null, 4]);
    expect(SettingsSchema.safeParse({ brandColor: "#ffd400" }).success).toBe(false);
  });
});
