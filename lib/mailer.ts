import nodemailer from "nodemailer";
import { logger } from "@/lib/logger";

function parsePort(rawPort: string | undefined, fallback: number) {
  const parsed = Number(rawPort);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function getTransportConfig() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return {
    host,
    port: parsePort(process.env.SMTP_PORT, 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user,
      pass,
    },
  };
}

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const config = getTransportConfig();
  if (!config) {
    return null;
  }

  cachedTransporter = nodemailer.createTransport(config);
  return cachedTransporter;
}

export async function sendVerificationCodeEmail(params: { email: string; code: string }) {
  const transporter = getTransporter();
  if (!transporter) {
    throw new Error("SMTP не настроен. Заполните SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS.");
  }

  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "no-reply@vpn-shop.local";
  const subject = "Код подтверждения VPN Shop";
  const text = `Ваш код подтверждения: ${params.code}. Код действует 10 минут.`;
  const html = `<p>Ваш код подтверждения: <strong>${params.code}</strong></p><p>Код действует 10 минут.</p>`;

  try {
    await transporter.sendMail({
      from,
      to: params.email,
      subject,
      text,
      html,
    });
  } catch (error) {
    logger.error("send_verification_email_failed", error, { email: params.email });
    throw new Error("Не удалось отправить письмо с кодом. Попробуйте позже.");
  }
}
