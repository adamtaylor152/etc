import { describe, expect, it } from "vitest";
import { clip, toE164 } from "@/server/sms";

describe("sms", () => {
  it.each([
    ["403-656-8200", "+14036568200"], ["(403) 656 8200", "+14036568200"], ["+1 403 656 8200", "+14036568200"],
    ["1-403-656-8200", "+14036568200"], ["656-8200", null], ["+44 20 7946 0958", null], ["", null], [null, null],
  ])("%s -> %s", (raw, want) => expect(toE164(raw)).toBe(want));
  it("clips long texts", () => {
    expect(clip("x".repeat(400)).length).toBe(300);
    expect(clip("short")).toBe("short");
  });
});

import { generateKeyPairSync, sign } from "node:crypto";
import { keyword, parseTelnyxEvent, verifyTelnyx } from "@/server/sms";

describe("Telnyx webhook", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pub = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64"); // raw 32-byte key, like the portal shows
  const body = JSON.stringify({ data: { event_type: "message.received", payload: { id: "m1", text: "STOP", from: { phone_number: "+14035550101" }, to: [{ phone_number: "+14036568200" }] } } });
  const ts = "1795000000";
  const sig = sign(null, Buffer.from(`${ts}|${body}`), privateKey).toString("base64");

  it("accepts a valid signature, rejects tampering, stale timestamps and missing headers", () => {
    expect(verifyTelnyx(body, sig, ts, pub, 1795000010)).toBe(true);
    expect(verifyTelnyx(body + " ", sig, ts, pub, 1795000010)).toBe(false);
    expect(verifyTelnyx(body, sig, ts, pub, 1795001000)).toBe(false);
    expect(verifyTelnyx(body, null, ts, pub)).toBe(false);
    expect(verifyTelnyx(body, sig, ts, "bm90IGEga2V5", 1795000010)).toBe(false);
  });
  it("parses inbound texts and delivery receipts", () => {
    expect(parseTelnyxEvent(JSON.parse(body))).toEqual({ kind: "received", id: "m1", from: "+14035550101", to: "+14036568200", text: "STOP" });
    expect(parseTelnyxEvent({ data: { event_type: "message.finalized", payload: { id: "m2", to: [{ status: "delivered" }] } } })).toEqual({ kind: "status", id: "m2", status: "delivered", error: null });
    expect(parseTelnyxEvent({ data: { event_type: "call.initiated", payload: { id: "x" } } })).toEqual({ kind: "other" });
    expect(parseTelnyxEvent(null)).toEqual({ kind: "other" });
  });
  it("recognises opt-out and opt-in keywords", () => {
    expect(keyword(" stop ")).toBe("STOP");
    expect(keyword("Unsubscribe")).toBe("STOP");
    expect(keyword("START")).toBe("START");
    expect(keyword("stop by at 3?")).toBeNull();
  });
});
