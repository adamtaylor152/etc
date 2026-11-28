// Small rules from the security review: redirect targets, the signing secret, upload size checks, quote expiry.
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { cappedFormData, ONE_FILE_BODY } from "@/server/http";
import { feedPath, feedUser } from "@/server/ical";
import { signedMediaPath } from "@/server/media";
import { clickUrl, signed, verifyClick, verifySigned } from "@/server/ops/campaigns";
import { rate } from "@/server/ops/marketing";
import { saveSignature } from "@/server/ops/signatures";
import { safePath } from "@/server/safe-path";
import { configuredSecret, signingSecret } from "@/server/secret";
import { assertApprovable } from "@/server/status/quote";

describe("safePath", () => {
  it("keeps paths inside the app", () => {
    for (const ok of ["/", "/ok?x=1", "/clients/abc?tab=notes#top", "/invoices?back=%2Fclients%2F1", "/search?q=a%5Cb", "/run?date=2026-12-01"]) expect(safePath(ok, "/home")).toBe(ok);
  });
  it("refuses anything a browser could take off-site", () => {
    const bad = ["/\\evil.com", "//evil.com", "/%5Cevil.com", "/%5cevil.com", "/%2Fevil.com", "https://evil.com", "http:/evil.com", "javascript:alert(1)", "evil.com", "",
      "/\t/evil.com", "/\n/evil.com", "/a\\b", "\\/evil.com", "/ok\u0000", "/%E0%A4%A", "/%09/evil.com"];
    for (const p of bad) expect(safePath(p, "/home")).toBe("/home");
    expect(safePath(null)).toBe("/");
    expect(safePath(undefined, "/routes")).toBe("/routes");
  });
});

describe("signing secret", () => {
  const before = { secret: process.env.MEDIA_SIGNING_SECRET, node: process.env.NODE_ENV };
  const set = (secret: string | undefined, node: string) => {
    if (secret === undefined) delete process.env.MEDIA_SIGNING_SECRET; else process.env.MEDIA_SIGNING_SECRET = secret;
    (process.env as Record<string, string>).NODE_ENV = node;
  };
  afterEach(() => set(before.secret, before.node ?? "test"));

  it("production refuses a missing, short or .env.example secret, for photos and campaign links alike", () => {
    for (const s of [undefined, "", "too-short", "change-me-to-32-random-bytes"]) {
      set(s, "production");
      expect(configuredSecret()).toBeNull();
      expect(() => signingSecret()).toThrow(/MEDIA_SIGNING_SECRET/);
      expect(() => signed("client1")).toThrow(/MEDIA_SIGNING_SECRET/);
      expect(() => clickUrl("r1", "https://etccrew.ca")).toThrow(/MEDIA_SIGNING_SECRET/);
      expect(() => signedMediaPath("a1", "md")).toThrow(/MEDIA_SIGNING_SECRET/);
      expect(feedUser(feedPath("u1").split("/").pop()!)).toBeNull(); // no secret = no calendar feed, not an error
    }
  });
  it("development falls back to a fixed value; a real secret is used as is", () => {
    set(undefined, "development");
    expect(signingSecret()).toBe("dev-only-media-secret-change-me");
    set("a-real-secret-of-32-characters!!", "production");
    expect(signingSecret()).toBe("a-real-secret-of-32-characters!!");
    expect(feedUser(feedPath("u1").split("/").pop()!)).toBe("u1");
  });
  it("campaign links verify only with their own signature", () => {
    set("a-real-secret-of-32-characters!!", "production");
    expect(verifySigned(signed("client1"))).toBe("client1");
    expect(verifySigned(signed("client1").slice(0, -1) + "x")).toBeNull();
    expect(verifySigned("client1.")).toBeNull();
    const s = new URL(clickUrl("r1", "https://etccrew.ca/book")).searchParams.get("s")!;
    expect(verifyClick("r1", "https://etccrew.ca/book", s)).toBe(true);
    expect([verifyClick("r1", "https://evil.example", s), verifyClick("r2", "https://etccrew.ca/book", s), verifyClick("r1", "https://etccrew.ca/book", ""), verifyClick("r1", "https://etccrew.ca/book", s + "é")]).toEqual([false, false, false, false]);
  });
});

describe("cappedFormData", () => {
  const form = (bytes: number) => { const f = new FormData(); f.append("kind", "BEFORE"); f.append("file", new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }), "a.jpg"); return f; };
  const post = (init: RequestInit) => new Request("http://x/api/uploads", { method: "POST", ...init });
  it("reads a form under the cap, fields and files intact", async () => {
    const got = await cappedFormData(post({ body: form(5000) }), 10_000);
    expect(got?.get("kind")).toBe("BEFORE");
    expect((got?.get("file") as File).size).toBe(5000);
  });
  it("refuses a declared length over the cap without reading the body", async () => {
    const req = post({ body: form(10), headers: { "content-length": String(ONE_FILE_BODY + 1) } });
    expect(await cappedFormData(req, ONE_FILE_BODY)).toBeNull();
    expect(req.bodyUsed).toBe(false);
  });
  it("stops reading a body that declares no length once it passes the cap", async () => {
    let sent = 0;
    const endless = new ReadableStream<Uint8Array>({ pull(c) { sent++; c.enqueue(new Uint8Array(4096)); } });
    const req = post({ body: endless, headers: { "content-type": "multipart/form-data; boundary=x" }, duplex: "half" } as RequestInit);
    expect(await cappedFormData(req, 20_000)).toBeNull();
    expect(sent).toBeLessThan(20);
    expect(await cappedFormData(post({ body: form(30_000) }), 20_000)).toBeNull(); // a real form over the cap
    expect(await cappedFormData(post({}), 20_000)).toBeNull(); // no body at all
  });
});

describe("signature image size", () => {
  const png = async (width: number, height: number) => `data:image/png;base64,${(await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png({ palette: true, compressionLevel: 9 }).toBuffer()).toString("base64")}`;
  const sign = (dataUrl: string) => saveSignature({ businessId: "b", kind: "INVOICE", invoiceId: "i", clientId: "c", dataUrl, signerName: "Pat", inPerson: false });
  it("refuses a small file that decodes to a huge canvas, before decoding it", async () => {
    const huge = await png(9000, 6000); // 54 megapixels of one colour: a small PNG, 216 MB as raw RGBA
    expect(huge.length).toBeLessThan(300_000);
    await expect(sign(huge)).rejects.toThrow("Please sign in the box");
    await expect(sign(await png(2001, 100))).rejects.toThrow("Please sign in the box");
    await expect(sign(await png(100, 1001))).rejects.toThrow("Please sign in the box");
  });
});

describe("quote approval", () => {
  it("is refused once the quote is past its valid-until date, or already answered", () => {
    expect(() => assertApprovable({ status: "AWAITING_RESPONSE", validUntil: "2026-12-01" }, "2026-12-01")).not.toThrow();
    expect(() => assertApprovable({ status: "AWAITING_RESPONSE", validUntil: null }, "2026-12-01")).not.toThrow();
    expect(() => assertApprovable({ status: "AWAITING_RESPONSE", validUntil: "2026-11-30" }, "2026-12-01")).toThrow("This quote has expired");
    expect(() => assertApprovable({ status: "DECLINED", validUntil: null }, "2026-12-01")).toThrow(/can't become approved/);
    expect(() => assertApprovable({ status: "DRAFT", validUntil: null }, "2026-12-01")).toThrow(/can't become approved/);
  });
});

describe("review rating", () => {
  it("ignores a rating that isn't a number instead of failing", async () => {
    expect(await rate("no-such-review", Number("abc"))).toBeNull();
    expect(await rate("no-such-review", Infinity)).toBeNull();
  });
});
