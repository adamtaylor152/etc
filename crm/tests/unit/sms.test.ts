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
    expect(parseTelnyxEvent(JSON.parse(body))).toEqual({ kind: "received", id: "m1", from: "+14035550101", to: "+14036568200", text: "STOP", type: "SMS", media: [] });
    const mms = { data: { event_type: "message.received", payload: { id: "m3", type: "MMS", text: "", from: { phone_number: "+14035550101" }, to: [{ phone_number: "+14036568200" }],
      media: [{ url: "https://media.telnyx.com/a.jpg", content_type: "image/jpeg" }, { url: "http://evil.local/x" }] } } };
    expect(parseTelnyxEvent(mms)).toMatchObject({ kind: "received", type: "MMS", media: [{ url: "https://media.telnyx.com/a.jpg", contentType: "image/jpeg" }] });
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

import { segments } from "@/server/segments";
describe("segments", () => {
  it("counts GSM-7 and unicode texts like carriers do", () => {
    expect(segments("")).toMatchObject({ parts: 0 });
    expect(segments("x".repeat(160))).toMatchObject({ parts: 1, unicode: false });
    expect(segments("x".repeat(161))).toMatchObject({ parts: 2, perPart: 153 });
    expect(segments("On our way 👍")).toMatchObject({ parts: 1, unicode: true, perPart: 70 });
    expect(segments("é".repeat(160))).toMatchObject({ parts: 1, unicode: false });
    expect(segments("{".repeat(81))).toMatchObject({ parts: 2 }); // extension chars count double
  });
});

import { rcsBody, withReplyHint } from "@/server/sms";
describe("RCS", () => {
  const base = { agentId: "etc", from: "+14036568200", to: "+14035550101" };
  it("sends text with reply buttons, falling back to SMS with a Reply line", () => {
    const b = rcsBody({ ...base, text: "Tomorrow at 9?", replies: ["Yes", "No"] });
    expect(b.agent_message.content_message).toEqual({ text: "Tomorrow at 9?", suggestions: [{ reply: { text: "Yes", postback_data: "reply:0" } }, { reply: { text: "No", postback_data: "reply:1" } }] });
    expect(b).toMatchObject({ agent_id: "etc", to: "+14035550101", sms_fallback: { from: "+14036568200", text: "Tomorrow at 9?\n\nReply: Yes / No" } });
    expect(withReplyHint("Hi", [])).toBe("Hi");
  });
  it("turns one photo into a card and several into a carousel, with an MMS fallback", () => {
    const one = rcsBody({ ...base, text: "Done!", mediaUrls: ["https://x/1.jpg"] });
    expect(one.agent_message.content_message).toMatchObject({ rich_card: { standalone_card: { card_content: { description: "Done!", media: { content_info: { file_url: "https://x/1.jpg" } } } } } });
    expect(one).toMatchObject({ mms_fallback: { media_urls: ["https://x/1.jpg"], text: "Done!" } });
    const two = rcsBody({ ...base, text: "", mediaUrls: ["https://x/1.jpg", "https://x/2.jpg"] });
    expect((two.agent_message.content_message as { rich_card: { carousel_card: { card_contents: unknown[] } } }).rich_card.carousel_card.card_contents).toHaveLength(2);
  });
  it("parses RCS replies, button taps, files, locations and read receipts", () => {
    const ev = (body: object) => ({ data: { event_type: "message.received", payload: { id: "r1", type: "RCS", from: { phone_number: "+14035550101" }, body } } });
    expect(parseTelnyxEvent(ev({ text: "hi" }))).toMatchObject({ kind: "received", type: "RCS", text: "hi", media: [] });
    expect(parseTelnyxEvent(ev({ suggestion_response: { text: "Yes", postback_data: "reply:0" } }))).toMatchObject({ text: "Yes" });
    expect(parseTelnyxEvent(ev({ user_file: { payload: { file_uri: "https://rcs/f.jpg", mime_type: "image/jpeg" } } }))).toMatchObject({ text: "", media: [{ url: "https://rcs/f.jpg", contentType: "image/jpeg" }] });
    expect(parseTelnyxEvent(ev({ location: { latitude: 51, longitude: -114 } }))).toMatchObject({ text: "📍 https://maps.google.com/?q=51,-114" });
    expect(parseTelnyxEvent({ data: { event_type: "message.read", payload: { id: "o1" } } })).toEqual({ kind: "status", id: "o1", status: "read", error: null });
    expect(keyword("help")).toBe("HELP");
  });
});
