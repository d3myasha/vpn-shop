import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const updateMock = vi.fn();
const findUniqueMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    payment: { updateMany: vi.fn() },
    subscription: {
      findUnique: findUniqueMock,
      update: updateMock
    }
  }
}));

const getYooKassaPaymentMock = vi.fn();
vi.mock("@/lib/yookassa", () => ({
  getYooKassaPayment: getYooKassaPaymentMock
}));

const activatePaymentMock = vi.fn();
vi.mock("@/lib/billing", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billing")>("@/lib/billing");
  return {
    ...actual,
    activatePaymentAndSubscription: activatePaymentMock
  };
});

const syncRemnawaveMock = vi.fn();
vi.mock("@/lib/remnawave", () => ({
  syncRemnawaveSubscription: syncRemnawaveMock
}));

vi.mock("@/lib/webhook-security", async () => {
  const actual = await vi.importActual<typeof import("@/lib/webhook-security")>("@/lib/webhook-security");
  return {
    ...actual,
    assertIpAllowed: vi.fn(),
    assertRateLimit: vi.fn(async () => undefined)
  };
});

describe("POST /api/webhooks/yookassa success flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db?schema=public";
    process.env.YOOKASSA_SHOP_ID = "shop";
    process.env.YOOKASSA_SECRET_KEY = "secret";
    process.env.YOOKASSA_RETURN_URL = "https://example.com/account";
    process.env.REMNAWAVE_API_URL = "https://panel.example.com";
    process.env.REMNAWAVE_API_KEY = "key";
    process.env.REMNAWAVE_API_HEADER_NAME = "Authorization";
    process.env.REMNAWAVE_API_HEADER_PREFIX = "Bearer";
    process.env.REFERRAL_INVITER_BONUS_DAYS = "7";
    process.env.REFERRAL_INVITED_BONUS_DAYS = "3";

    getYooKassaPaymentMock.mockResolvedValue({
      id: "payment_1",
      status: "succeeded",
      amount: { value: "120.00", currency: "RUB" },
      metadata: { plan_code: "super_1m" }
    });

    activatePaymentMock.mockResolvedValue({
      subscriptionId: "sub_1"
    });

    findUniqueMock.mockResolvedValue({
      id: "sub_1",
      expiresAt: new Date("2026-12-31T00:00:00.000Z"),
      deviceLimitSnapshot: 5,
      remnawaveProfileId: null,
      user: { email: "user@example.com" },
      plan: {
        internalSquadUuid: "internal-squad-1",
        externalSquadUuid: "external-squad-1"
      }
    });

    syncRemnawaveMock.mockResolvedValue({
      remnawaveUserUuid: "rw-user-1",
      subscriptionUrl: "https://panel.example.com/sub/abc"
    });
  });

  test("processes succeeded payment and updates subscription remnawave fields", async () => {
    const { POST } = await import("@/app/api/webhooks/yookassa/route");

    const request = new NextRequest("http://localhost/api/webhooks/yookassa", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "77.75.156.11" },
      body: JSON.stringify({
        event: "payment.succeeded",
        object: { id: "payment_1", status: "succeeded", amount: { value: "120.00", currency: "RUB" } }
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(syncRemnawaveMock).toHaveBeenCalledTimes(1);
    expect(syncRemnawaveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        internalSquadUuid: "internal-squad-1",
        externalSquadUuid: "external-squad-1"
      })
    );
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});
