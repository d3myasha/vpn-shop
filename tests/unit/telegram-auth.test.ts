import crypto from "node:crypto";
import { describe, expect, test } from "vitest";
import { verifyTelegramAuthPayload } from "@/lib/telegram-auth";

describe("telegram auth verification", () => {
  function signPayload(payload: Record<string, string>, token: string) {
    const check = Object.entries(payload)
      .filter(([key]) => key !== "hash")
      .map(([key, value]) => `${key}=${value}`)
      .sort()
      .join("\n");

    const secret = crypto.createHash("sha256").update(token).digest();
    return crypto.createHmac("sha256", secret).update(check).digest("hex");
  }

  test("accepts valid payload", () => {
    process.env.TELEGRAM_BOT_TOKEN = "123456:TEST_TOKEN";
    process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS = "600";

    const payload = {
      id: "100500",
      first_name: "D",
      auth_date: String(Math.floor(Date.now() / 1000)),
      hash: "",
    };

    payload.hash = signPayload(payload, process.env.TELEGRAM_BOT_TOKEN as string);

    const result = verifyTelegramAuthPayload(payload);
    expect(result.ok).toBe(true);
  });

  test("rejects invalid hash", () => {
    process.env.TELEGRAM_BOT_TOKEN = "123456:TEST_TOKEN";
    process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS = "600";

    const payload = {
      id: "100500",
      first_name: "D",
      auth_date: String(Math.floor(Date.now() / 1000)),
      hash: "deadbeef",
    };

    const result = verifyTelegramAuthPayload(payload);
    expect(result.ok).toBe(false);
  });

  test("rejects expired payload", () => {
    process.env.TELEGRAM_BOT_TOKEN = "123456:TEST_TOKEN";
    process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS = "60";

    const payload = {
      id: "100500",
      first_name: "D",
      auth_date: String(Math.floor(Date.now() / 1000) - 120),
      hash: "",
    };

    payload.hash = signPayload(payload, process.env.TELEGRAM_BOT_TOKEN as string);

    const result = verifyTelegramAuthPayload(payload);
    expect(result.ok).toBe(false);
  });
});
