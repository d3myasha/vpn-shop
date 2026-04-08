import { z } from "zod";

const checkoutResponseSchema = z.object({
  checkoutUrl: z.string().url(),
});

export class BotApiError extends Error {
  constructor(message: string, public readonly statusCode = 502) {
    super(message);
    this.name = "BotApiError";
  }
}

type CreateBotCheckoutInput = {
  botUserId: string;
  planCode: string;
  promoCode?: string;
  referralCode?: string;
  returnUrl: string;
  source: "vpn-shop-web";
};

function getBotApiBaseUrl() {
  const value = process.env.REMNASHOP_API_BASE_URL?.trim();
  if (!value) {
    throw new BotApiError("REMNASHOP_API_BASE_URL не задан", 503);
  }
  return value.replace(/\/+$/, "");
}

function getBotApiToken() {
  const value = process.env.REMNASHOP_API_TOKEN?.trim();
  if (!value) {
    throw new BotApiError("REMNASHOP_API_TOKEN не задан", 503);
  }
  return value;
}

function getTimeoutMs() {
  const parsed = Number(process.env.REMNASHOP_API_TIMEOUT_MS ?? 10_000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10_000;
}

function buildErrorMessage(status: number, body: unknown) {
  if (body && typeof body === "object") {
    const payload = body as { error?: unknown; message?: unknown };
    const message = typeof payload.error === "string" ? payload.error : typeof payload.message === "string" ? payload.message : null;
    if (message) {
      return message;
    }
  }

  if (status === 401 || status === 403) {
    return "Ошибка авторизации API бота";
  }
  if (status === 404) {
    return "Endpoint оплаты в боте не найден";
  }
  if (status === 422) {
    return "Некорректные параметры оплаты";
  }
  if (status >= 500) {
    return "Сервис оплаты бота временно недоступен";
  }
  return `Ошибка API бота (HTTP ${status})`;
}

export async function createBotCheckout(input: CreateBotCheckoutInput) {
  const baseUrl = getBotApiBaseUrl();
  const token = getBotApiToken();
  const timeoutMs = getTimeoutMs();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/api/v1/payments/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      throw new BotApiError(buildErrorMessage(response.status, payload), response.status);
    }

    const parsed = checkoutResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new BotApiError("Invalid checkout response from bot backend", 502);
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof BotApiError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new BotApiError("Превышен таймаут запроса к API бота", 504);
    }
    const message = error instanceof Error ? error.message : "Ошибка запроса к API бота";
    throw new BotApiError(message, 502);
  } finally {
    clearTimeout(timeout);
  }
}
