import { z } from "zod";

const optionalString = z.string().nullable().optional();

const botUserSchema = z.object({
  id: z.string(),
  email: optionalString,
  telegramId: optionalString,
  username: optionalString,
});

const botSubscriptionSchema = z.object({
  id: z.string(),
  status: optionalString,
  expiresAt: optionalString,
  subscriptionUrl: optionalString,
});

const checkoutResponseSchema = z.object({
  confirmationUrl: z.string().url().optional(),
  redirectUrl: z.string().url().optional(),
  paymentUrl: z.string().url().optional(),
});

export class RemnashopAdapterError extends Error {
  constructor(message: string, public readonly statusCode = 500) {
    super(message);
    this.name = "RemnashopAdapterError";
  }
}

export type RemnashopUser = {
  id: string;
  email: string | null;
  telegramId: string | null;
  username: string | null;
};

export type RemnashopSubscription = {
  id: string;
  status: string | null;
  expiresAt: string | null;
  subscriptionUrl: string | null;
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function getBaseConfig() {
  const baseUrl = process.env.REMNASHOP_API_URL?.trim();
  const serviceToken = process.env.REMNASHOP_SERVICE_TOKEN?.trim();
  const headerName = (process.env.REMNASHOP_SERVICE_HEADER_NAME ?? "Authorization").trim();
  const headerPrefix = process.env.REMNASHOP_SERVICE_HEADER_PREFIX?.trim() ?? "Bearer";

  if (!baseUrl || !serviceToken) {
    return null;
  }

  return {
    baseUrl: trimTrailingSlash(baseUrl),
    serviceToken,
    headerName,
    headerPrefix,
  };
}

function buildAuthHeader() {
  const config = getBaseConfig();
  if (!config) {
    throw new RemnashopAdapterError("Интеграция с ботом не настроена", 503);
  }

  const headerValue = config.headerPrefix
    ? `${config.headerPrefix} ${config.serviceToken}`
    : config.serviceToken;

  return { [config.headerName]: headerValue };
}

function route(path: string) {
  const config = getBaseConfig();
  if (!config) {
    throw new RemnashopAdapterError("Интеграция с ботом не настроена", 503);
  }

  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${config.baseUrl}${normalized}`;
}

async function request(path: string, init: RequestInit) {
  const response = await fetch(route(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeader(),
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new RemnashopAdapterError(
      `Bot backend error ${response.status}${text ? `: ${text}` : ""}`,
      response.status,
    );
  }

  return response.json().catch(() => ({}));
}

function extractObject(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return {};
}

function extractArray(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }
  return [];
}

function pickFirstObject(payload: unknown): Record<string, unknown> {
  const root = extractObject(payload);
  const response = root.response;

  if (response && typeof response === "object" && !Array.isArray(response)) {
    const resObject = response as Record<string, unknown>;
    const nestedUser = extractObject(resObject.user);
    if (Object.keys(nestedUser).length > 0) {
      return nestedUser;
    }
    return resObject;
  }

  if (Array.isArray(response)) {
    return extractObject(response[0]);
  }

  if (Array.isArray(root.data)) {
    return extractObject(root.data[0]);
  }

  const dataObject = extractObject(root.data);
  if (Object.keys(dataObject).length > 0) {
    return dataObject;
  }

  return root;
}

export async function getBotUserByTelegramId(telegramId: string): Promise<RemnashopUser | null> {
  const encoded = encodeURIComponent(telegramId);
  const path =
    process.env.REMNASHOP_USERS_BY_TELEGRAM_PATH?.replace(":telegramId", encoded) ??
    `/api/v1/users/by-telegram-id/${encoded}`;
  const payload = await request(path, { method: "GET" });

  const candidate = pickFirstObject(payload);
  const parsed = botUserSchema.safeParse({
    id: candidate.id ?? candidate.uuid,
    email: candidate.email,
    telegramId: candidate.telegramId ?? candidate.telegram_id,
    username: candidate.username,
  });

  if (!parsed.success) {
    return null;
  }

  return {
    id: parsed.data.id,
    email: parsed.data.email ?? null,
    telegramId: parsed.data.telegramId ?? null,
    username: parsed.data.username ?? null,
  };
}

export async function getBotUserByEmail(email: string): Promise<RemnashopUser | null> {
  const encoded = encodeURIComponent(email.toLowerCase());
  const path =
    process.env.REMNASHOP_USERS_BY_EMAIL_PATH?.replace(":email", encoded) ??
    `/api/v1/users/by-email/${encoded}`;
  const payload = await request(path, { method: "GET" });
  const candidate = pickFirstObject(payload);

  const parsed = botUserSchema.safeParse({
    id: candidate.id ?? candidate.uuid,
    email: candidate.email,
    telegramId: candidate.telegramId ?? candidate.telegram_id,
    username: candidate.username,
  });

  if (!parsed.success) {
    return null;
  }

  return {
    id: parsed.data.id,
    email: parsed.data.email ?? null,
    telegramId: parsed.data.telegramId ?? null,
    username: parsed.data.username ?? null,
  };
}

export async function getBotUserById(botUserId: string): Promise<RemnashopUser | null> {
  const encoded = encodeURIComponent(botUserId);
  const path = process.env.REMNASHOP_USER_BY_ID_PATH?.replace(":id", encoded) ?? `/api/v1/users/${encoded}`;
  const payload = await request(path, { method: "GET" });
  const candidate = pickFirstObject(payload);

  const parsed = botUserSchema.safeParse({
    id: candidate.id ?? candidate.uuid,
    email: candidate.email,
    telegramId: candidate.telegramId ?? candidate.telegram_id,
    username: candidate.username,
  });

  if (!parsed.success) {
    return null;
  }

  return {
    id: parsed.data.id,
    email: parsed.data.email ?? null,
    telegramId: parsed.data.telegramId ?? null,
    username: parsed.data.username ?? null,
  };
}

export async function getBotSubscriptionByUserId(botUserId: string): Promise<RemnashopSubscription | null> {
  const encoded = encodeURIComponent(botUserId);
  const path = process.env.REMNASHOP_SUBSCRIPTION_BY_USER_PATH?.replace(":id", encoded) ?? `/api/v1/subscriptions/by-user/${encoded}`;
  const payload = await request(path, { method: "GET" });
  const candidate = pickFirstObject(payload);

  const parsed = botSubscriptionSchema.safeParse({
    id: candidate.id ?? candidate.uuid,
    status: candidate.status,
    expiresAt: candidate.expiresAt ?? candidate.expireAt,
    subscriptionUrl: candidate.subscriptionUrl,
  });

  if (!parsed.success) {
    return null;
  }

  return {
    id: parsed.data.id,
    status: parsed.data.status ?? null,
    expiresAt: parsed.data.expiresAt ?? null,
    subscriptionUrl: parsed.data.subscriptionUrl ?? null,
  };
}

export async function createBotCheckout(params: {
  botUserId: string;
  planCode: string;
  promoCode?: string;
  referralCode?: string;
  returnUrl?: string;
}) {
  const path = process.env.REMNASHOP_CHECKOUT_PATH ?? "/api/v1/checkout";
  const payload = await request(path, {
    method: "POST",
    body: JSON.stringify({
      userId: params.botUserId,
      planCode: params.planCode,
      promoCode: params.promoCode,
      referralCode: params.referralCode,
      returnUrl: params.returnUrl,
    }),
  });

  const root = extractObject(payload);
  const response = extractObject(root.response);
  const data = extractObject(root.data);
  const candidate = {
    confirmationUrl: response.confirmationUrl ?? response.confirmation_url ?? response.redirectUrl,
    redirectUrl: response.redirectUrl ?? response.paymentUrl,
    paymentUrl: data.paymentUrl ?? data.confirmationUrl ?? root.paymentUrl,
  };

  const parsed = checkoutResponseSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new RemnashopAdapterError("Bot checkout response format is not supported", 502);
  }

  const url = parsed.data.confirmationUrl ?? parsed.data.redirectUrl ?? parsed.data.paymentUrl;
  if (!url) {
    throw new RemnashopAdapterError("Bot checkout did not return redirect url", 502);
  }

  return { confirmationUrl: url };
}

export async function getBotPlans() {
  const path = process.env.REMNASHOP_PLANS_PATH ?? "/api/v1/plans";
  const payload = await request(path, { method: "GET" });
  const root = extractObject(payload);
  const responseArray = extractArray(root.response);
  const dataArray = extractArray(root.data);

  return responseArray.length > 0 ? responseArray : dataArray;
}

export function isRemnashopConfigured() {
  return Boolean(getBaseConfig());
}
