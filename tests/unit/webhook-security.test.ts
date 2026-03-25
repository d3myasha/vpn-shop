import { describe, expect, test } from "vitest";
import { assertIpAllowed, assertRateLimit } from "@/lib/webhook-security";

describe("assertIpAllowed", () => {
  test("accepts ipv4 from explicit allowlist", () => {
    expect(() =>
      assertIpAllowed({
        ip: "77.75.156.11",
        allowedRaw: "77.75.156.11"
      })
    ).not.toThrow();
  });

  test("accepts ipv6 cidr from default yookassa ranges", () => {
    expect(() =>
      assertIpAllowed({
        ip: "2a02:5180::1",
        allowedRaw: ""
      })
    ).not.toThrow();
  });

  test("rejects unknown ip", () => {
    expect(() =>
      assertIpAllowed({
        ip: "8.8.8.8",
        allowedRaw: "77.75.156.11"
      })
    ).toThrow();
  });
});

describe("assertRateLimit", () => {
  test("blocks requests above limit", async () => {
    const key = `unit-rate-${Date.now()}`;
    await expect(assertRateLimit({ key, limitPerMinute: 2 })).resolves.toBeUndefined();
    await expect(assertRateLimit({ key, limitPerMinute: 2 })).resolves.toBeUndefined();
    await expect(assertRateLimit({ key, limitPerMinute: 2 })).rejects.toThrow();
  });
});
