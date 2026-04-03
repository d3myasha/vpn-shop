import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { generateUniqueReferralCode } from "@/lib/users";
import { getBotUserByTelegramId, BotDbAdapterError } from "@/lib/bot-db-adapter";

export type TelegramAuthPayload = {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string;
  hash: string;
};

function getTelegramBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN не настроен");
  }
  return token;
}

function parseAuthDate(value: string) {
  const authTs = Number(value);
  if (!Number.isFinite(authTs)) {
    return null;
  }
  return authTs;
}

export function verifyTelegramAuthPayload(payload: TelegramAuthPayload) {
  const authTs = parseAuthDate(payload.auth_date);
  if (!authTs) {
    return { ok: false as const, reason: "Некорректное время авторизации" };
  }

  const maxAgeSeconds = Number(process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS ?? 300);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - authTs > maxAgeSeconds) {
    return { ok: false as const, reason: "Сессия Telegram устарела" };
  }

  const botToken = getTelegramBotToken();
  const checkEntries = Object.entries(payload)
    .filter(([key, value]) => key !== "hash" && value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${String(value)}`)
    .sort();

  const dataCheckString = checkEntries.join("\n");

  const secret = crypto.createHash("sha256").update(botToken).digest();
  const calculatedHash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const providedHash = payload.hash.toLowerCase();

  if (providedHash.length !== calculatedHash.length) {
    return { ok: false as const, reason: "Неверная подпись Telegram" };
  }

  const valid = crypto.timingSafeEqual(Buffer.from(calculatedHash, "hex"), Buffer.from(providedHash, "hex"));
  if (!valid) {
    return { ok: false as const, reason: "Неверная подпись Telegram" };
  }

  return { ok: true as const };
}

async function ensureUniqueTelegramPlaceholderEmail(telegramId: string) {
  const candidate = `tg-${telegramId}@telegram.local`;
  const exists = await prisma.user.findUnique({ where: { email: candidate }, select: { id: true } });
  if (!exists) {
    return candidate;
  }
  return `tg-${telegramId}-${crypto.randomUUID().slice(0, 8)}@telegram.local`;
}

export async function upsertTelegramUser(payload: TelegramAuthPayload) {
  const verification = verifyTelegramAuthPayload(payload);
  if (!verification.ok) {
    throw new Error(verification.reason);
  }

  const telegramId = String(payload.id);
  const botUser = await getBotUserByTelegramId(telegramId);
  if (!botUser?.id) {
    throw new BotDbAdapterError("Пользователь не найден в backend бота", 404);
  }

  const existingIdentity = await prisma.botIdentity.findFirst({
    where: {
      provider: "remnashop",
      OR: [{ telegramId }, { botUserId: botUser.id }],
    },
    include: { user: true },
  });

  if (existingIdentity) {
    const updateData: { telegramId?: string; botUserId?: string } = {};
    if (!existingIdentity.telegramId) {
      updateData.telegramId = telegramId;
    }
    if (existingIdentity.botUserId !== botUser.id) {
      updateData.botUserId = botUser.id;
    }
    if (Object.keys(updateData).length > 0) {
      await prisma.botIdentity.update({ where: { id: existingIdentity.id }, data: updateData });
    }

    return existingIdentity.user;
  }

  const email = await ensureUniqueTelegramPlaceholderEmail(telegramId);
  const referralCode = await generateUniqueReferralCode();
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(crypto.randomUUID(), 12),
      referralCode,
    },
  });

  await prisma.botIdentity.upsert({
    where: { userId: user.id },
    update: {
      provider: "remnashop",
      botUserId: botUser.id,
      telegramId,
    },
    create: {
      userId: user.id,
      provider: "remnashop",
      botUserId: botUser.id,
      telegramId,
    },
  });

  return user;
}
