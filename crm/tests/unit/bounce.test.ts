import { describe, expect, it } from "vitest";
import { parseBounce, permanentRejection } from "@/server/email/bounce";

describe("permanentRejection", () => {
  it("is true only for a 55x refusal of the recipient", () => {
    expect(permanentRejection({ responseCode: 550, code: "EENVELOPE", rejected: ["a@x.ca"] })).toBe(true);
    expect(permanentRejection({ responseCode: 550, command: "RCPT TO" })).toBe(true);
    expect(permanentRejection({ responseCode: 550, code: "EENVELOPE", command: "MAIL FROM" })).toBe(false); // our sender refused, not their mailbox
    expect(permanentRejection({ responseCode: 451, code: "EENVELOPE" })).toBe(false); // try again later
    expect(permanentRejection({ responseCode: 535, code: "EAUTH" })).toBe(false); // our login, not their mailbox
    expect(permanentRejection({ responseCode: 554, command: "DATA" })).toBe(false); // content refused, address may be fine
    expect(permanentRejection(new Error("ETIMEDOUT"))).toBe(false);
  });
});

describe("parseBounce", () => {
  const dsn = (status: string) => `From: MAILER-DAEMON@mx.example\nContent-Type: multipart/report; report-type=delivery-status\n\nReporting-MTA: dns; mx.example\n\nFinal-Recipient: rfc822; Gone@Example.com\nAction: failed\nStatus: ${status}\n\nMessage-ID: <abc123@etccrew.ca>\nSubject: Invoice #12\n`;
  it("reads the failed address and the ids of the original message", () => {
    expect(parseBounce(dsn("5.1.1"))).toEqual({ recipient: "gone@example.com", status: "5.1.1", messageIds: ["<abc123@etccrew.ca>"] });
  });
  it("ignores temporary failures and ordinary email", () => {
    expect(parseBounce(dsn("4.2.2"))).toBeNull();
    expect(parseBounce("From: someone@example.com\nSubject: hi\n\nStatus: 5.1.1 is my favourite")).toBeNull();
  });
});
