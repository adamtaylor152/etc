import { generateKeyPairSync } from "node:crypto";
import { dkimSign } from "mailauth/lib/dkim/sign";
import { describe, expect, it } from "vitest";
import { autoDeposited, parseRawEmail, signedByInterac } from "@/server/billing/interac-email";

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
