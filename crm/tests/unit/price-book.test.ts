// Price book form rules: what the editor may save, keys for new services, reordering.
import { describe, expect, it } from "vitest";
import { moved, newKey, serviceInput } from "@/server/ops/price-book";

const form = {
  name: "  Gutter cleaning ", description: " Up to two storeys ", category: "CLEANUP", pricingMode: "FIXED", price: "89.5", unit: "VISIT", isAddon: false,
  duration: "90", cost: "12.25", taxExempt: true, checklistTemplateId: "", bookable: true, bookingLabel: "", active: true,
};

describe("serviceInput", () => {
  it("turns the form into columns (cents, minutes, blanks to null)", () => {
    expect(serviceInput(form)).toEqual({
      name: "Gutter cleaning", description: "Up to two storeys", category: "CLEANUP", pricingMode: "FIXED", unitPriceCents: 8950, unit: "VISIT", isAddon: false,
      defaultDurationMin: 90, unitCostCents: 1225, taxExempt: true, checklistTemplateId: null, bookable: true, bookingLabel: null, active: true,
    });
  });
  it("quote services carry no price; fixed ones need one", () => {
    expect(serviceInput({ ...form, pricingMode: "QUOTE" })).toMatchObject({ pricingMode: "QUOTE", unitPriceCents: null });
    expect(() => serviceInput({ ...form, price: "" })).toThrow("needs a price");
    expect(serviceInput({ ...form, price: "0" }).unitPriceCents).toBe(0);
  });
  it.each([
    [{ name: " " }, "name"], [{ price: "-1" }, "negative"], [{ price: "abc" }, "number"], [{ duration: "1.5" }, "whole minutes"], [{ duration: "0" }, "at least 1"],
    [{ category: "NOPE" }, "category"], [{ unit: "MILE" }, "unit"], [{ cost: "-5" }, "negative"],
  ])("rejects %j", (patch, msg) => {
    expect(() => serviceInput({ ...form, ...patch })).toThrow(msg);
  });
  it("never produces a key: keys are set once on create", () => {
    expect(serviceInput({ ...form, key: "snow_once" } as typeof form)).not.toHaveProperty("key");
  });
});

describe("newKey / moved", () => {
  it("slugs the name and numbers a clash", () => {
    expect(newKey("Gutter & eaves cleaning!", [])).toBe("gutter_eaves_cleaning");
    expect(newKey("Snow once", ["snow_once", "snow_once_2"])).toBe("snow_once_3");
    expect(newKey("???", [])).toBe("service");
  });
  it("swaps with the neighbour and stops at the ends", () => {
    expect(moved(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moved(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(moved(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(moved(["a", "b", "c"], "x", 1)).toEqual(["a", "b", "c"]);
  });
});
