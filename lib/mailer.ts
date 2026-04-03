import { Resend } from "resend";
import { logger } from "@/lib/logger";

function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    from: process.env.RESEND_FROM ?? "VPN Shop <no-reply@vpn-shop.local>",
  };
}

let cachedClient: Resend | null = null;

function getResendClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const config = getResendConfig();
  if (!config) {
    return null;
  }

  cachedClient = new Resend(config.apiKey);
  return cachedClient;
}

export async function sendVerificationCodeEmail(params: { email: string; code: string }) {
  const resend = getResendClient();
  const config = getResendConfig();
  if (!resend || !config) {
    throw new Error("Resend не настроен. Заполните RESEND_API_KEY и RESEND_FROM.");
  }

  const subject = "Код подтверждения VPN Shop";
  const text = `Ваш код подтверждения: ${params.code}. Код действует 10 минут.`;
  const html = `<p>Ваш код подтверждения: <strong>${params.code}</strong></p><p>Код действует 10 минут.</p>`;

  try {
    const result = await resend.emails.send({
      from: config.from,
      to: params.email,
      subject,
      text,
      html,
    });

    if (result.error) {
      throw new Error(result.error.message);
    }
  } catch (error) {
    logger.error("send_verification_email_failed", error, { email: params.email });
    throw new Error("Не удалось отправить письмо с кодом. Попробуйте позже.");
  }
}
