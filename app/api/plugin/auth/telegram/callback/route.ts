import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { upsertTelegramUser, linkTelegramToExistingUser, type TelegramAuthPayload } from "@/lib/telegram-auth";
import { BotDbAdapterError } from "@/lib/bot-db-adapter";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as TelegramAuthPayload;
    const session = await auth();

    if (session?.user?.id) {
      const user = await linkTelegramToExistingUser(session.user.id, payload);
      return NextResponse.json({
        ok: true,
        mode: "linked",
        user: {
          id: user.id,
          email: user.email,
        },
      });
    }

    const user = await upsertTelegramUser(payload);

    return NextResponse.json({
      ok: true,
      mode: "signin",
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram auth failed";
    const statusCode = error instanceof BotDbAdapterError ? error.statusCode : 401;
    logger.error("plugin_telegram_callback_failed", error, { route: "/api/plugin/auth/telegram/callback" });
    return NextResponse.json({ ok: false, error: message }, { status: statusCode });
  }
}
