import { NextRequest, NextResponse } from "next/server";
import { upsertTelegramUser, type TelegramAuthPayload } from "@/lib/telegram-auth";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as TelegramAuthPayload;
    const user = await upsertTelegramUser(payload);

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram auth failed";
    logger.error("plugin_telegram_callback_failed", error, { route: "/api/plugin/auth/telegram/callback" });
    return NextResponse.json({ ok: false, error: message }, { status: 401 });
  }
}
