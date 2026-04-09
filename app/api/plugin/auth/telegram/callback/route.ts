import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { upsertTelegramUser, linkTelegramToExistingUser, type TelegramAuthPayload } from "@/lib/telegram-auth";
import { BotDbAdapterError } from "@/lib/bot-db-adapter";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    // Rate limiting: 10 попыток в минуту на IP
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    const rateLimitKey = `rate-limit:telegram-auth:${clientIp}`;
    const isAllowed = await checkRateLimit({ key: rateLimitKey, limitPerMinute: 10 });
    
    if (!isAllowed) {
      return NextResponse.json(
        { ok: false, error: "Слишком много попыток. Попробуйте позже" },
        { status: 429 }
      );
    }

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
    const statusCode = error instanceof BotDbAdapterError ? error.statusCode : 401;
    logger.error("plugin_telegram_callback_failed", error, { route: "/api/plugin/auth/telegram/callback" });
    return NextResponse.json({ ok: false, error: "Ошибка авторизации через Telegram" }, { status: statusCode });
  }
}
