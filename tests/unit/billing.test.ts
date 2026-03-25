import { describe, expect, test } from "vitest";
import { calculateDiscountRub } from "@/lib/discount";

describe("calculateDiscountRub", () => {
  test("returns 0 without promo", () => {
    expect(calculateDiscountRub(100, null)).toBe(0);
  });

  test("applies percent discount", () => {
    expect(calculateDiscountRub(200, { discountPercent: 10, discountRub: null })).toBe(20);
  });

  test("applies fixed discount", () => {
    expect(calculateDiscountRub(500, { discountPercent: null, discountRub: 70 })).toBe(70);
  });

  test("never reduces amount below 1 RUB", () => {
    expect(calculateDiscountRub(50, { discountPercent: null, discountRub: 1000 })).toBe(49);
    expect(calculateDiscountRub(50, { discountPercent: 99, discountRub: null })).toBe(49);
  });
});
