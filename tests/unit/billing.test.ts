import { describe, expect, test, vi } from "vitest";
import { calculateDiscountRub } from "@/lib/discount";
import { normalizeReferralCode, resolveReferralInviter } from "@/lib/users";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

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

describe("referral helpers", () => {
  test("normalizes referral codes", () => {
    expect(normalizeReferralCode(" abC123 ")).toBe("ABC123");
    expect(normalizeReferralCode("")).toBe("");
    expect(normalizeReferralCode(undefined)).toBe("");
  });

  test("resolveReferralInviter skips self referral by own code", async () => {
    const inviter = await resolveReferralInviter({
      referralCode: "abc123",
      userId: "user_1",
      userReferralCode: "ABC123",
    });

    expect(inviter).toBeNull();
  });

  test("resolveReferralInviter skips inviter with same user id", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user_1" } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const inviter = await resolveReferralInviter({
      referralCode: "abc123",
      userId: "user_1",
    });

    expect(inviter).toBeNull();
  });

  test("resolveReferralInviter returns normalized inviter lookup result", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "inviter_1" } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const inviter = await resolveReferralInviter({
      referralCode: " abc123 ",
      userId: "user_1",
      userReferralCode: "SELF999",
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { referralCode: "ABC123" },
      select: { id: true },
    });
    expect(inviter).toEqual({ id: "inviter_1" });
  });
});
