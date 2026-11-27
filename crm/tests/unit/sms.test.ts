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
