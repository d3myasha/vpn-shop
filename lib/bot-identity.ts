import { prisma } from "@/lib/prisma";
import { getBotUserByEmail, getBotUserByTelegramId } from "@/lib/remnashop-adapter";

export async function resolveOrCreateBotIdentityForUser(params: {
  userId: string;
  email: string;
  telegramId?: string | null;
}) {
  const existing = await prisma.botIdentity.findUnique({
    where: { userId: params.userId },
    select: { botUserId: true, telegramId: true },
  });
  if (existing?.botUserId) {
    return existing;
  }

  let botUser = null;
  if (params.telegramId) {
    botUser = await getBotUserByTelegramId(params.telegramId);
  }

  if (!botUser) {
    botUser = await getBotUserByEmail(params.email);
  }

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
