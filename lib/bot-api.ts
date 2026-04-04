export class BotApiError extends Error {
  constructor(message: string, public readonly statusCode = 500) {
    super(message);
    this.name = "BotApiError";
  }
}

type CreateStorefrontCheckoutInput = {
  telegramId: string;
  planCode: string;
  promoCode?: string;
  referralCode?: string;
  returnUrl: string;
  source: "vpn-shop-web";
};

type CreateStorefrontCheckoutResponse = {
  checkoutUrl: string;
  paymentId: string;
  expiresAt?: string;
};

function getBotApiBaseUrl() {
  return process.env.REMNASHOP_API_BASE_URL?.trim() ?? "";
}

function getBotApiToken() {
  return process.env.REMNASHOP_API_TOKEN?.trim() ?? "";
}

function getBotApiTimeoutMs() {
  const value = Number(process.env.REMNASHOP_API_TIMEOUT_MS ?? 8000);
  return Number.isFinite(value) && value > 0 ? value : 8000;
}

function ensureBotApiConfigured() {
  const baseUrl = getBotApiBaseUrl();
  const token = getBotApiToken();
  if (!baseUrl || !token) {
    throw new BotApiError("Bot API integration is not configured", 503);
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), token };
}

function parseJsonObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function resolveErrorMessage(data: Record<string, unknown> | null) {
  if (!data) {
    return null;
  }

  const rawMessage = data.error ?? data.message;
  if (typeof rawMessage === "string" && rawMessage.trim()) {
    return rawMessage.trim();
  }

  return null;
}

function validateCheckoutResponse(data: Record<string, unknown> | null): CreateStorefrontCheckoutResponse {
  const checkoutUrl = typeof data?.checkoutUrl === "string" ? data.checkoutUrl.trim() : "";
  const paymentId = typeof data?.paymentId === "string" ? data.paymentId.trim() : "";
  const expiresAt = typeof data?.expiresAt === "string" ? data.expiresAt.trim() : undefined;

  if (!checkoutUrl || !paymentId) {
    throw new BotApiError("Invalid checkout response from bot backend", 502);
  }

  try {
    new URL(checkoutUrl);
  } catch {
    throw new BotApiError("Invalid checkout URL from bot backend", 502);
  }

  return {
    checkoutUrl,
    paymentId,
    expiresAt: expiresAt || undefined,
  };
}

export function isBotApiConfigured() {
  return Boolean(getBotApiBaseUrl() && getBotApiToken());
}

export async function createStorefrontCheckout(input: CreateStorefrontCheckoutInput): Promise<CreateStorefrontCheckoutResponse> {
  const { baseUrl, token } = ensureBotApiConfigured();
  const timeoutMs = getBotApiTimeoutMs();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/api/storefront/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
      signal: controller.signal,
      cache: "no-store",
    });

    const data = parseJsonObject(await response.json().catch(() => null));

    if (!response.ok) {
      const message = resolveErrorMessage(data) ?? "Bot checkout request failed";
      throw new BotApiError(message, response.status >= 400 ? response.status : 502);
    }

    return validateCheckoutResponse(data);
  } catch (error) {
    if (error instanceof BotApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new BotApiError("Bot checkout request timeout", 504);
    }

    throw new BotApiError(
      error instanceof Error ? `Bot checkout request failed: ${error.message}` : "Bot checkout request failed",
      502,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
