import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveOrCreateBotIdentityForUser } from "@/lib/bot-identity";
import {
  getBotCurrentSubscriptionByTelegramId,
  getBotTransactionsByTelegramId,
  isBotDbConfigured,
  BotDbAdapterError,
} from "@/lib/bot-db-adapter";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isBotDbConfigured()) {
    return NextResponse.json({ error: "Bot backend integration is not configured" }, { status: 503 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      botIdentity: {
        select: {
          telegramId: true,
        },
      },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const telegramId = user.botIdentity?.telegramId;
  if (!telegramId) {
    return NextResponse.json({ error: "Telegram account is not linked with bot profile" }, { status: 409 });
  }

  const identity = await resolveOrCreateBotIdentityForUser({
    userId: user.id,
    telegramId,
  });

  try {
    const [subscription, payments] = await Promise.all([
      getBotCurrentSubscriptionByTelegramId(telegramId),
      getBotTransactionsByTelegramId(telegramId, 20),
    ]);
    return NextResponse.json({ subscription, payments, botIdentity: identity ?? user.botIdentity });
  } catch (error) {
    if (error instanceof BotDbAdapterError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Failed to load subscription from bot backend" }, { status: 502 });
  }
}
