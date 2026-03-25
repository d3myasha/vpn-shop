import { describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => null)
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    plan: {
      findUnique: vi.fn(async () => ({
        code: "simple_1m",
        isActive: true,
        priceRub: 80,
        title: "Простая 1 месяц"
      }))
    }
  }
}));

describe("POST /api/checkout", () => {
  test("returns 401 for unauthenticated JSON request", async () => {
    const { POST } = await import("@/app/api/checkout/route");

    const request = new NextRequest("http://localhost/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planCode: "simple_1m" })
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
