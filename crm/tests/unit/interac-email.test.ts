import { generateKeyPairSync } from "node:crypto";
import { dkimSign } from "mailauth/lib/dkim/sign";
import { describe, expect, it } from "vitest";
import { addressedToUs, autoDeposited, inboundAuthorized, interacRecipients, parseRawEmail, signedByInterac } from "@/server/billing/interac-email";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pubB64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
const resolver = async (name: string) => {
  if (name === "test._domainkey.payments.interac.ca" || name === "test._domainkey.evil.example") return [[`v=DKIM1; k=rsa; p=${pubB64}`]];
  const e = new Error("not found") as Error & { code: string }; e.code = "ENOTFOUND"; throw e;
};

const email = (from: string) => [
  `From: Interac <${from}>`, "To: pay@etccrew.ca", "Subject: INTERAC e-Transfer: JANE SMITH sent you money.",
  "Date: Fri, 27 Nov 2026 12:00:00 -0700", "Message-ID: <abc@payments.interac.ca>", "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "",
  "JANE SMITH sent you $35.00 (CAD) and the money has been automatically deposited.", "Message: ETC-1042", "",
].join("\r\n");

async function signAs(domain: string, from: string) {
  const raw = email(from);
  const res = await dkimSign(raw, { signatureData: [{ signingDomain: domain, selector: "test", privateKey: privateKey.export({ type: "pkcs8", format: "pem" }) as string }] });
  return res.signatures + raw;
}

describe("Interac email trust", () => {
  it("accepts a message signed by interac.ca and aligned with From", async () => {
    expect(await signedByInterac(await signAs("payments.interac.ca", "notify@payments.interac.ca"), resolver as never)).toBe(true);
  });
  it("rejects tampering, other domains and unsigned mail", async () => {
    const good = await signAs("payments.interac.ca", "notify@payments.interac.ca");
    expect(await signedByInterac(good.replace("$35.00", "$350.00"), resolver as never)).toBe(false);
    expect(await signedByInterac(await signAs("evil.example", "notify@payments.interac.ca"), resolver as never)).toBe(false);
    expect(await signedByInterac(email("notify@payments.interac.ca"), resolver as never)).toBe(false);
  });
  it("parses subject/text and spots auto-deposits", async () => {
    const m = await parseRawEmail(email("notify@payments.interac.ca"));
    expect(m.subject).toMatch(/JANE SMITH sent you money/);
    expect(autoDeposited(m.text)).toBe(true);
    expect(autoDeposited("JANE SMITH sent you $35.00. To deposit your money, click here")).toBe(false);
  });
});

// A client can send themselves an e-Transfer, get a genuine signed notice addressed to THEM, and forward it to pay@.
describe("who an Interac notice was sent to", () => {
  it("reads the To address the signature covers", async () => {
    expect(await interacRecipients(await signAs("payments.interac.ca", "notify@payments.interac.ca"), resolver as never)).toEqual(["pay@etccrew.ca"]);
    expect(await interacRecipients(email("notify@payments.interac.ca"), resolver as never)).toBeNull();
  });
  const toMallory = async () => {
    const raw = email("notify@payments.interac.ca").replace("To: pay@etccrew.ca", "To: Mallory <Mallory@Example.com>");
    const res = await dkimSign(raw, { signatureData: [{ signingDomain: "payments.interac.ca", selector: "test", privateKey: privateKey.export({ type: "pkcs8", format: "pem" }) as string }] });
    return res.signatures + raw;
  };
  it("can't be re-addressed: changing To breaks the signature, and a To header added in front is not the signed one", async () => {
    const changed = (await toMallory()).replace("To: Mallory <Mallory@Example.com>", "To: pay@etccrew.ca");
    expect(await interacRecipients(changed, resolver as never)).toBeNull();
    const prepended = "To: pay@etccrew.ca\r\n" + (await toMallory());
    expect((await parseRawEmail(prepended)).subject).toMatch(/sent you money/); // still a readable email
    expect(await interacRecipients(prepended, resolver as never)).toEqual(["mallory@example.com"]);
  });
  it("a notice signed for someone else's address is not ours", async () => {
    const to = await interacRecipients(await toMallory(), resolver as never);
    expect(to).toEqual(["mallory@example.com"]);
    expect(addressedToUs(to!, ["pay@etccrew.ca"])).toBe(false);
    expect(addressedToUs(["pay@etccrew.ca"], ["Pay@EtcCrew.ca "])).toBe(true);
    expect(addressedToUs([], ["pay@etccrew.ca"])).toBe(false); // To not covered by the signature
    expect(addressedToUs(to!, [])).toBe(true); // no e-Transfer address configured: nothing to compare with
  });
});

describe("inbound secret", () => {
  const req = (secret?: string) => new Request("http://x/api/interac/email", { method: "POST", headers: secret === undefined ? {} : { "x-etc-secret": secret } });
  it("needs the exact shared secret, and a real one", () => {
    const before = process.env.INTERAC_INBOUND_SECRET;
    try {
      process.env.INTERAC_INBOUND_SECRET = "0123456789abcdef0123";
      expect(inboundAuthorized(req("0123456789abcdef0123"))).toBe(true);
      expect([req(), req(""), req("0123456789abcdef0124"), req("0123456789abcdef01230")].map(inboundAuthorized)).toEqual([false, false, false, false]);
      process.env.INTERAC_INBOUND_SECRET = "short";
      expect(inboundAuthorized(req("short"))).toBe(false);
      delete process.env.INTERAC_INBOUND_SECRET;
      expect(inboundAuthorized(req(""))).toBe(false);
    } finally {
      if (before === undefined) delete process.env.INTERAC_INBOUND_SECRET; else process.env.INTERAC_INBOUND_SECRET = before;
    }
  });
});
