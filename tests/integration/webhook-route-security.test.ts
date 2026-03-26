import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    payment: { updateMany: vi.fn() },
    referralSettings: { findUnique: vi.fn(), create: vi.fn() },
    subscription: { findUnique: vi.fn(), update: vi.fn() }
  }
}));

vi.mock("@/lib/yookassa", () => ({
  getYooKassaPayment: vi.fn()
}));

describe("POST /api/webhooks/yookassa", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db?schema=public";
    process.env.YOOKASSA_SHOP_ID = "shop";
    process.env.YOOKASSA_SECRET_KEY = "secret";
    process.env.YOOKASSA_RETURN_URL = "https://example.com/account";
    process.env.REMNAWAVE_API_URL = "https://panel.example.com";
    process.env.REMNAWAVE_API_KEY = "key";
    process.env.REMNAWAVE_API_HEADER_NAME = "Authorization";
    process.env.REMNAWAVE_API_HEADER_PREFIX = "Bearer";
    process.env.YOOKASSA_WEBHOOK_IP_ALLOWLIST_ENABLED = "true";
    process.env.YOOKASSA_WEBHOOK_ALLOWED_IPS = "77.75.156.11";
  });

  test("blocks webhook request from non-allowlisted ip", async () => {
    const { POST } = await import("@/app/api/webhooks/yookassa/route");

    const request = new NextRequest("http://localhost/api/webhooks/yookassa", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "8.8.8.8"
      },
      body: JSON.stringify({ event: "payment.succeeded", object: { id: "test_payment" } })
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });
});
