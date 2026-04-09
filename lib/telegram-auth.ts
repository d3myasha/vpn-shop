import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { generateUniqueReferralCode } from "@/lib/users";
import { getBotUserByTelegramId, BotDbAdapterError } from "@/lib/bot-db-adapter";
import { resolvePromotedRole, resolveRoleForNewUser } from "@/lib/admin-role";

export type TelegramAuthPayload = {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string;
  hash: string;
};

type ResolvedBotUser = {
  telegramId: string;
  botUserId: string;
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

async function resolveVerifiedBotUser(payload: TelegramAuthPayload): Promise<ResolvedBotUser> {
  const verification = verifyTelegramAuthPayload(payload);
  if (!verification.ok) {
    throw new Error(verification.reason);
  }

  const telegramId = String(payload.id);
  const botUser = await getBotUserByTelegramId(telegramId);
  if (!botUser?.id) {
    throw new BotDbAdapterError("Пользователь не найден в backend бота", 404);
  }

  return {
    telegramId,
    botUserId: botUser.id,
  };
}

export async function upsertTelegramUser(payload: TelegramAuthPayload) {
  const { telegramId, botUserId } = await resolveVerifiedBotUser(payload);

  // Используем транзакцию для предотвращения race condition
  const result = await prisma.$transaction(async (tx) => {
    // Используем SELECT ... FOR UPDATE для блокировки записей
    const existingIdentity = await tx.botIdentity.findFirst({
      where: {
        provider: "remnashop",
        OR: [{ telegramId }, { botUserId }],
      },
      include: { user: true },
    });

    if (existingIdentity) {
      const updateData: { telegramId?: string; botUserId?: string } = {};
      if (!existingIdentity.telegramId) {
        updateData.telegramId = telegramId;
      }
      if (existingIdentity.botUserId !== botUserId) {
        updateData.botUserId = botUserId;
      }
      if (Object.keys(updateData).length > 0) {
        await tx.botIdentity.update({ where: { id: existingIdentity.id }, data: updateData });
      }

      const promotedRole = resolvePromotedRole(existingIdentity.user.role, {
        email: existingIdentity.user.email,
        telegramId,
      });
      if (promotedRole !== existingIdentity.user.role) {
        const updatedUser = await tx.user.update({
          where: { id: existingIdentity.user.id },
          data: { role: promotedRole },
        });
        return { ...updatedUser };
      }

      return existingIdentity.user;
    }

    const referralCode = await generateUniqueReferralCode();
    const user = await tx.user.create({
      data: {
        email: null,
        passwordHash: await bcrypt.hash(crypto.randomUUID(), 12),
        referralCode,
        role: resolveRoleForNewUser({ telegramId }),
      },
    });

    await tx.botIdentity.upsert({
      where: { userId: user.id },
      update: {
        provider: "remnashop",
        botUserId,
        telegramId,
      },
      create: {
        userId: user.id,
        provider: "remnashop",
        botUserId,
        telegramId,
      },
    });

    return user;
  }, {
    isolationLevel: "Serializable",
  });

  return result;
}

export async function linkTelegramToExistingUser(userId: string, payload: TelegramAuthPayload) {
  const { telegramId, botUserId } = await resolveVerifiedBotUser(payload);

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true },
  });
  if (!targetUser) {
    throw new BotDbAdapterError("User not found", 404);
  }

  const conflictingIdentity = await prisma.botIdentity.findFirst({
    where: {
      provider: "remnashop",
      OR: [{ telegramId }, { botUserId }],
    },
    select: { userId: true },
  });

  if (conflictingIdentity && conflictingIdentity.userId !== userId) {
    throw new BotDbAdapterError("Этот Telegram уже привязан к другому аккаунту", 409);
  }

  await prisma.botIdentity.upsert({
    where: { userId },
    update: {
      provider: "remnashop",
      botUserId,
      telegramId,
    },
    create: {
      userId,
      provider: "remnashop",
      botUserId,
      telegramId,
    },
  });

  const promotedRole = resolvePromotedRole(targetUser.role, {
    email: targetUser.email,
    telegramId,
  });
  if (promotedRole !== targetUser.role) {
    await prisma.user.update({
      where: { id: userId },
      data: { role: promotedRole },
    });
    return { ...targetUser, role: promotedRole };
  }

  return targetUser;
}
