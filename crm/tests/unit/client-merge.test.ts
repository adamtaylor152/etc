import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "@/server/csv";
import { CLIENT_REFS, mapClientRows, mergeContactPoints } from "@/server/ops/client-import";

describe("csv", () => {
  it("reads quoted commas, quotes and newlines, and skips blank lines", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\n\n"two\nlines",z\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"'], ["two\nlines", "z"]]);
  });
  it("round-trips and defuses spreadsheet formulas", () => {
    const rows = [["a,b", 'q"q', "plain"], ["=SUM(A1)", "", "x"]];
    expect(parseCsv(toCsv(rows))).toEqual([["a,b", 'q"q', "plain"], ["'=SUM(A1)", "", "x"]]);
  });
});

describe("mapClientRows", () => {
  it("maps common header names and splits a single Name column", () => {
    expect(mapClientRows("Name,E-mail,Mobile,Street Address,Ignored\nJo Van Dyke,JO@x.ca,403-555-0101,12 Elm St,zzz")).toEqual([
      { Name: "Jo Van Dyke", "First name": "Jo", "Last name": "Van Dyke", Email: "JO@x.ca", Phone: "403-555-0101", Address: "12 Elm St" },
    ]);
  });
  it("needs a name column", () => expect(() => mapClientRows("Email\na@x.ca")).toThrow(/First name/));
});

describe("mergeContactPoints", () => {
  it("keeps the kept client's first, adds the duplicate's, no repeats", () => {
    const m = mergeContactPoints({ emails: [], phones: [], email: "a@x.ca", phone: "+14035550101" }, { emails: [{ address: "a@x.ca", label: "Main" }, { address: "b@x.ca", label: "Work" }], phones: [], email: "a@x.ca", phone: "+14035550199" });
    expect(m.emails.map((e) => e.address)).toEqual(["a@x.ca", "b@x.ca"]);
    expect(m.phones.map((p) => p.number)).toEqual(["+14035550101", "+14035550199"]);
  });
});

describe("merge covers every table that points at a client", () => {
  it("lists each model with a clientId column", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].filter((m) => /^\s+clientId\s/m.test(m[2])).map((m) => m[1][0].toLowerCase() + m[1].slice(1));
    expect([...CLIENT_REFS].sort()).toEqual(models.sort());
  });
});
