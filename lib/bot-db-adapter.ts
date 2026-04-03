import { Pool, type QueryResultRow } from "pg";

export class BotDbAdapterError extends Error {
  constructor(message: string, public readonly statusCode = 500) {
    super(message);
    this.name = "BotDbAdapterError";
  }
}

export type BotDbUser = {
  id: string;
  telegramId: string;
  username: string | null;
  referralCode: string | null;
  role: string | null;
};

export type BotDbSubscription = {
  id: string;
  status: string;
  expiresAt: string | null;
  subscriptionUrl: string | null;
  remnawaveUserUuid: string | null;
  deviceLimit: number;
  trafficLimit: number;
  trafficLimitStrategy: string | null;
  planName: string | null;
  planId: number | null;
  durationDays: number | null;
};

export type BotDbPayment = {
  id: string;
  paymentId: string | null;
  status: string;
  amountRub: number;
  gatewayType: string | null;
  createdAt: string;
};

export type BotDbPlanOption = {
  days: number;
  priceRub: number;
};

export type BotDbPlan = {
  id: string;
  publicCode: string;
  title: string;
  description: string | null;
  limitType: "DEVICES" | "TRAFFIC";
  deviceLimit: number;
  trafficLimitGb: number | null;
  options: BotDbPlanOption[];
};

type BotUserRow = QueryResultRow & {
  id: number;
  telegram_id: string | number;
  username: string | null;
  referral_code: string | null;
  role: string | null;
};

type BotSubscriptionRow = QueryResultRow & {
  id: number;
  status: string;
  expire_at: Date | string | null;
  url: string | null;
  user_remna_id: string | null;
  device_limit: number;
  traffic_limit: number;
  traffic_limit_strategy: string | null;
  plan_snapshot: {
    name?: string;
    id?: number;
    duration?: number;
  } | null;
};

type BotTransactionRow = QueryResultRow & {
  id: number;
  payment_id: string | null;
  status: string;
  pricing: {
    final_amount?: number | string;
  } | null;
  gateway_type: string | null;
  created_at: Date | string;
};

type BotPlanRow = QueryResultRow & {
  id: number;
  public_code: string;
  name: string;
  description: string | null;
  type: string;
  traffic_limit: number;
  device_limit: number;
};

type BotPlanDurationRow = QueryResultRow & {
  plan_id: number;
  days: number;
  order_index: number;
  price_rub: number;
};

let cachedPool: Pool | null = null;

function normalizeConnectionString(value: string) {
  return value.trim();
}

function getBotDbUrl() {
  return process.env.REMNASHOP_DATABASE_URL?.trim() || process.env.BOT_DATABASE_URL?.trim() || "";
}

function getPool() {
  if (cachedPool) {
    return cachedPool;
  }

  const connectionString = getBotDbUrl();
  if (!connectionString) {
    throw new BotDbAdapterError("Интеграция с БД бота не настроена", 503);
  }

  cachedPool = new Pool({
    connectionString: normalizeConnectionString(connectionString),
    max: Number(process.env.REMNASHOP_DB_POOL_MAX ?? 5),
    idleTimeoutMillis: Number(process.env.REMNASHOP_DB_IDLE_MS ?? 10_000),
    connectionTimeoutMillis: Number(process.env.REMNASHOP_DB_CONNECT_TIMEOUT_MS ?? 5_000),
    ssl: process.env.REMNASHOP_DB_SSL === "true" ? { rejectUnauthorized: process.env.REMNASHOP_DB_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined,
  });

  return cachedPool;
}

async function query<T extends QueryResultRow>(sql: string, values: unknown[]) {
  try {
    const pool = getPool();
    return await pool.query<T>(sql, values);
  } catch (error) {
    throw new BotDbAdapterError(
      error instanceof Error ? `Ошибка чтения БД бота: ${error.message}` : "Ошибка чтения БД бота",
      502,
    );
  }
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function toRubInt(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.round(numeric);
}

function inferLimitType(type: string) {
  const normalized = type.toUpperCase();
  if (normalized === "TRAFFIC") {
    return "TRAFFIC" as const;
  }
  return "DEVICES" as const;
}

function bytesToGb(trafficLimit: number) {
  if (!trafficLimit || trafficLimit <= 0) {
    return null;
  }

  const gb = trafficLimit / (1024 * 1024 * 1024);
  if (!Number.isFinite(gb) || gb <= 0) {
    return null;
  }
  return Math.round(gb);
}

export function isBotDbConfigured() {
  return Boolean(getBotDbUrl());
}

export function buildBotPlanDeepLink(publicCode: string) {
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim();
  if (!botUsername) {
    throw new BotDbAdapterError("Не задан NEXT_PUBLIC_TELEGRAM_BOT_USERNAME для deep-link в бота", 503);
  }

  const code = publicCode.trim();
  if (!code) {
    throw new BotDbAdapterError("Некорректный тариф для deep-link", 400);
  }

  return `https://t.me/${botUsername}?start=plan_${encodeURIComponent(code)}`;
}

export async function getBotUserByTelegramId(telegramId: string): Promise<BotDbUser | null> {
  const result = await query<BotUserRow>(
    `
      SELECT id, telegram_id, username, referral_code, role
      FROM users
      WHERE telegram_id::text = $1
      LIMIT 1
    `,
    [telegramId.trim()],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    telegramId: String(row.telegram_id),
    username: row.username,
    referralCode: row.referral_code,
    role: row.role,
  };
}

export async function getBotUserById(botUserId: string): Promise<BotDbUser | null> {
  const numericId = Number(botUserId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return null;
  }

  const result = await query<BotUserRow>(
    `
      SELECT id, telegram_id, username, referral_code, role
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [numericId],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    telegramId: String(row.telegram_id),
    username: row.username,
    referralCode: row.referral_code,
    role: row.role,
  };
}

export async function getBotCurrentSubscriptionByTelegramId(telegramId: string): Promise<BotDbSubscription | null> {
  const result = await query<BotSubscriptionRow>(
    `
      SELECT s.id,
             s.status,
             s.expire_at,
             s.url,
             s.user_remna_id,
             s.device_limit,
             s.traffic_limit,
             s.traffic_limit_strategy,
             s.plan_snapshot
      FROM users u
      JOIN subscriptions s ON s.id = u.current_subscription_id
      WHERE u.telegram_id::text = $1
      LIMIT 1
    `,
    [telegramId.trim()],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const snapshot = row.plan_snapshot ?? {};

  return {
    id: String(row.id),
    status: row.status,
    expiresAt: toIsoString(row.expire_at),
    subscriptionUrl: row.url,
    remnawaveUserUuid: row.user_remna_id,
    deviceLimit: row.device_limit ?? 0,
    trafficLimit: row.traffic_limit ?? 0,
    trafficLimitStrategy: row.traffic_limit_strategy,
    planName: typeof snapshot.name === "string" ? snapshot.name : null,
    planId: typeof snapshot.id === "number" ? snapshot.id : null,
    durationDays: typeof snapshot.duration === "number" ? snapshot.duration : null,
  };
}

export async function getBotTransactionsByTelegramId(telegramId: string, limit = 20): Promise<BotDbPayment[]> {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const result = await query<BotTransactionRow>(
    `
      SELECT id, payment_id, status, pricing, gateway_type, created_at
      FROM transactions
      WHERE user_telegram_id::text = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [telegramId.trim(), safeLimit],
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    paymentId: row.payment_id,
    status: row.status,
    amountRub: toRubInt(row.pricing?.final_amount),
    gatewayType: row.gateway_type,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
  }));
}

export async function getBotPlans(): Promise<BotDbPlan[]> {
  const [plansResult, durationsResult] = await Promise.all([
    query<BotPlanRow>(
      `
        SELECT id, public_code, name, description, type, traffic_limit, device_limit
        FROM plans
        WHERE is_active = true
          AND is_trial = false
          AND public_code IS NOT NULL
        ORDER BY order_index ASC, id ASC
      `,
      [],
    ),
    query<BotPlanDurationRow>(
      `
        SELECT pd.plan_id,
               pd.days,
               pd.order_index,
               COALESCE(MAX(CASE WHEN pp.currency = 'RUB' THEN pp.price END), 0)::float AS price_rub
        FROM plan_durations pd
        LEFT JOIN plan_prices pp ON pp.plan_duration_id = pd.id
        GROUP BY pd.plan_id, pd.days, pd.order_index
        ORDER BY pd.plan_id ASC, pd.order_index ASC, pd.days ASC
      `,
      [],
    ),
  ]);

  const optionsByPlanId = new Map<number, BotDbPlanOption[]>();
  for (const row of durationsResult.rows) {
    const options = optionsByPlanId.get(row.plan_id) ?? [];
    options.push({
      days: row.days,
      priceRub: toRubInt(row.price_rub),
    });
    optionsByPlanId.set(row.plan_id, options);
  }

  return plansResult.rows.map((plan) => ({
    id: String(plan.id),
    publicCode: plan.public_code,
    title: plan.name,
    description: plan.description,
    limitType: inferLimitType(plan.type),
    deviceLimit: plan.device_limit ?? 0,
    trafficLimitGb: bytesToGb(plan.traffic_limit ?? 0),
    options: optionsByPlanId.get(plan.id) ?? [],
  }));
}
