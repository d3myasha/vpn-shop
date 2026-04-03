import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveOrCreateBotIdentityForUser } from "@/lib/bot-identity";
import { getBotUserById, getBotUserByTelegramId, isBotDbConfigured, BotDbAdapterError } from "@/lib/bot-db-adapter";

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
      email: true,
      role: true,
      referralCode: true,
      botIdentity: {
        select: {
          botUserId: true,
          telegramId: true,
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const identity = await resolveOrCreateBotIdentityForUser({
    userId: user.id,
    telegramId: user.botIdentity?.telegramId ?? null,
  });

  if (!identity?.botUserId && !user.botIdentity?.telegramId) {
    return NextResponse.json({ error: "Telegram account is not linked with bot profile" }, { status: 409 });
  }

  try {
    let botUser = null;
    if (identity?.botUserId) {
      botUser = await getBotUserById(identity.botUserId);
    }

    if (!botUser && user.botIdentity?.telegramId) {
      botUser = await getBotUserByTelegramId(user.botIdentity.telegramId);
    }

    if (!botUser) {
      return NextResponse.json({ error: "Bot user not found for current account" }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        referralCode: user.referralCode,
      },
      botIdentity: identity ?? user.botIdentity,
      botUser,
    });
  } catch (error) {
    if (error instanceof BotDbAdapterError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Failed to load profile from bot backend" }, { status: 502 });
  }
}
