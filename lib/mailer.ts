import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
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

  if (!host) {
    return null;
  }

  const config: SMTPTransport.Options = {
    host,
    port: parsePort(process.env.SMTP_PORT, 25),
    secure: process.env.SMTP_SECURE === "true",
    name: process.env.SMTP_HELO_NAME || undefined,
  };

  const authEnabled = process.env.SMTP_AUTH_ENABLED === "true" || (Boolean(user) && Boolean(pass));
  if (authEnabled) {
    if (!user || !pass) {
      throw new Error("SMTP_AUTH_ENABLED=true, но SMTP_USER или SMTP_PASS не заполнены.");
    }
    config.auth = {
      user,
      pass,
    };
  }

  return config;
}

function getConfiguredFromAddress() {
  const from = process.env.SMTP_FROM?.trim();
  if (from) {
    return from;
  }

  const smtpUser = process.env.SMTP_USER?.trim();
  if (smtpUser) {
    return smtpUser;
  }

  return "no-reply@localhost";
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
    throw new Error("SMTP не настроен. Заполните хотя бы SMTP_HOST/SMTP_PORT.");
  }

  const from = getConfiguredFromAddress();
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
