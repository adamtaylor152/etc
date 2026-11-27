import { describe, expect, it } from "vitest";
import { listHref, sortRows } from "@/components/list-page";
import { parseQuery } from "@/server/search";

describe("search query parsing", () => {
  it("spots record numbers, invoice refs, phone digits and words", () => {
    expect(parseQuery("#12")).toMatchObject({ num: 12, invoiceRef: false });
    expect(parseQuery("1042")).toMatchObject({ num: 1042 });
    expect(parseQuery("ETC-1042")).toMatchObject({ num: 1042, invoiceRef: true });
    expect(parseQuery("(403) 555-0101")).toMatchObject({ digits: "4035550101", num: null });
    expect(parseQuery("Evergreen Way")).toMatchObject({ digits: null, num: null, q: "Evergreen Way" });
    expect(parseQuery("Unit 12 Evergreen").digits).toBeNull();
  });
});

describe("list helpers", () => {
  it("keeps params, changes some, drops empty ones", () => {
    expect(listHref("/jobs", { status: "LATE", q: "x" }, { sort: "client", q: undefined })).toBe("/jobs?status=LATE&sort=client");
    expect(listHref("/jobs", {}, {})).toBe("/jobs");
  });
  it("sorts by a key either way, nulls last", () => {
    const rows = [{ n: 2 }, { n: null }, { n: 1 }];
    const by = { n: (r: { n: number | null }) => r.n };
    expect(sortRows(rows, "n", "asc", by).map((r) => r.n)).toEqual([1, 2, null]);
    expect(sortRows(rows, "n", "desc", by).map((r) => r.n)).toEqual([2, 1, null]);
    expect(sortRows(rows, undefined, "asc", by)).toBe(rows);
  });
});
