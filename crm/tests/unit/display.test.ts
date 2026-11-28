import { describe, expect, it } from "vitest";
import { moveStatus } from "@/components/move-status";
import { prettyPhone } from "@/components/phone";

describe("prettyPhone", () => {
  it("shows every ten-digit number the same way", () => {
    for (const raw of ["+14035559876", "403-555-9876", "(403) 555-9876", "4035559876", "1 403 555 9876"]) expect(prettyPhone(raw)).toBe("(403) 555-9876");
  });
  it("leaves anything else as typed", () => {
    expect(prettyPhone("403-555-9876 x12")).toBe("403-555-9876 x12");
    expect(prettyPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(prettyPhone(null)).toBe("");
  });
});

describe("moveStatus", () => {
  it("says whether the client was told", () => {
    expect(moveStatus({ warnings: [], notified: "email" })).toBe("Saved. Client emailed about the new time.");
    expect(moveStatus({ warnings: [], notified: "text" })).toBe("Saved. Client texted about the new time.");
    expect(moveStatus({ warnings: [], notified: null })).toBe("Saved.");
  });
  it("keeps conflicts in the message", () => {
    expect(moveStatus({ warnings: ["dad is already booked then"], notified: "email" })).toBe("Saved, but: dad is already booked then. Client emailed about the new time.");
  });
});
