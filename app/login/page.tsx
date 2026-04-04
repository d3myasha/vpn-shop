import LoginPageClient from "./login-page-client";

function normalizeTelegramBotUsername(raw: string | undefined): string | null {
  const normalized = raw?.trim().replace(/^@/, "") ?? "";
  if (!normalized || normalized.includes(" ")) {
    return null;
  }
  return normalized;
}

export default function LoginPage() {
  const telegramBotUsername = normalizeTelegramBotUsername(process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME);

  return <LoginPageClient telegramBotUsername={telegramBotUsername} />;
}
