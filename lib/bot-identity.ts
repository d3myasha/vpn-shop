import { prisma } from "@/lib/prisma";
import { getBotUserByTelegramId } from "@/lib/bot-db-adapter";

export async function resolveOrCreateBotIdentityForUser(params: {
  userId: string;
  telegramId?: string | null;
}) {
  const existing = await prisma.botIdentity.findUnique({
    where: { userId: params.userId },
    select: { botUserId: true, telegramId: true },
  });
  if (existing?.botUserId) {
    return existing;
  }

  if (!params.telegramId) {
    return null;
  }

  const botUser = await getBotUserByTelegramId(params.telegramId);

  if (!botUser?.id) {
    return null;
  }

  return prisma.botIdentity.upsert({
    where: { userId: params.userId },
    update: {
      provider: "remnashop",
      botUserId: botUser.id,
      telegramId: params.telegramId ?? botUser.telegramId ?? null,
    },
    create: {
      userId: params.userId,
      provider: "remnashop",
      botUserId: botUser.id,
      telegramId: params.telegramId ?? botUser.telegramId ?? null,
    },
    select: { botUserId: true, telegramId: true },
  });
}
