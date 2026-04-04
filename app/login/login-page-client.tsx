"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

const TELEGRAM_WIDGET_TIMEOUT_MS = 7000;

function resolveNextPath(raw: string | null) {
  if (!raw) {
    return "/account";
  }
  if (!raw.startsWith("/")) {
    return "/account";
  }
  if (raw.startsWith("//")) {
    return "/account";
  }

  return raw;
}

type LoginPageClientProps = {
  telegramBotUsername: string | null;
};

export default function LoginPageClient({ telegramBotUsername }: LoginPageClientProps) {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [draftEmail, setDraftEmail] = useState("");
  const [draftPassword, setDraftPassword] = useState("");
  const [draftReferralCode, setDraftReferralCode] = useState("");
  const [draftLegalAccepted, setDraftLegalAccepted] = useState(false);
  const [telegramUnavailable, setTelegramUnavailable] = useState(false);
  const nextPath = resolveNextPath(searchParams.get("next"));

  useEffect(() => {
    if (!telegramBotUsername) {
      setTelegramUnavailable(true);
      setTelegramError("Telegram-вход временно недоступен. Используйте вход по email.");
      return;
    }

    const root = document.getElementById("telegram-login-widget");
    if (!root) {
      return;
    }

    let timedOut = false;
    let widgetReady = false;

    root.innerHTML = "";
    setTelegramUnavailable(false);
    setTelegramError(null);

    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      const hasWidgetIframe = !!root.querySelector("iframe");
      if (!hasWidgetIframe && !widgetReady) {
        setTelegramUnavailable(true);
        setTelegramError("Telegram-вход временно недоступен. Используйте вход по email.");
      }
    }, TELEGRAM_WIDGET_TIMEOUT_MS);

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", telegramBotUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");

    script.onerror = () => {
      window.clearTimeout(timeoutId);
      setTelegramUnavailable(true);
      setTelegramError("Telegram-вход временно недоступен. Используйте вход по email.");
    };

    script.onload = () => {
      widgetReady = true;
      if (!timedOut) {
        window.clearTimeout(timeoutId);
      }
      setTelegramUnavailable(false);
      setTelegramError(null);
    };

    (window as unknown as { onTelegramAuth?: (user: Record<string, string>) => void }).onTelegramAuth = async (user) => {
      setLoading(true);
      setTelegramError(null);
      setInfo(null);

      const callbackResponse = await fetch("/api/plugin/auth/telegram/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user),
      });

      if (!callbackResponse.ok) {
        const data = (await callbackResponse.json().catch(() => ({}))) as { error?: string };
        setTelegramError(data.error ?? "Не удалось выполнить вход через Telegram");
        setLoading(false);
        return;
      }

      const result = await signIn("telegram", {
        ...user,
        redirect: false,
      });

      if (!result || result.error) {
        setTelegramError("Не удалось выполнить вход через Telegram");
        setLoading(false);
        return;
      }

      window.location.href = nextPath;
    };

    root.appendChild(script);

    return () => {
      window.clearTimeout(timeoutId);
      root.innerHTML = "";
      (window as unknown as { onTelegramAuth?: (user: Record<string, string>) => void }).onTelegramAuth = undefined;
    };
  }, [nextPath, telegramBotUsername]);

  async function signInWithCredentials(email: string, password: string) {
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (!result || result.error) {
      setEmailError("Неверный email или пароль");
      return false;
    }

    window.location.href = nextPath;
    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setEmailError(null);
    setInfo(null);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    const referralCode = String(form.get("referralCode") ?? "").trim().toUpperCase();
    const verificationCode = String(form.get("verificationCode") ?? "").trim();
    const legalAccepted = form.get("legalAccepted") === "on";

    if (needsVerification) {
      const registerResponse = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: draftEmail,
          password: draftPassword,
          referralCode: draftReferralCode,
          verificationCode,
          legalAccepted: draftLegalAccepted,
        }),
      });

      if (!registerResponse.ok) {
        const data = (await registerResponse.json().catch(() => ({}))) as { error?: string };
        setEmailError(data.error ?? "Не удалось завершить регистрацию");
        setLoading(false);
        return;
      }

      const signedIn = await signInWithCredentials(draftEmail, draftPassword);
      if (!signedIn) {
        setLoading(false);
      }
      return;
    }

    const requestCodeResponse = await fetch("/api/register/request-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, legalAccepted }),
    });

    if (!requestCodeResponse.ok) {
      const data = (await requestCodeResponse.json().catch(() => ({}))) as { error?: string };
      setEmailError(data.error ?? "Не удалось продолжить");
      setLoading(false);
      return;
    }

    const data = (await requestCodeResponse.json().catch(() => ({}))) as {
      exists?: boolean;
      sent?: boolean;
    };

    if (data.exists) {
      const signedIn = await signInWithCredentials(email, password);
      if (!signedIn) {
        setLoading(false);
      }
      return;
    }

    setDraftEmail(email);
    setDraftPassword(password);
    setDraftReferralCode(referralCode);
    setDraftLegalAccepted(legalAccepted);
    setNeedsVerification(true);
    setInfo("Мы отправили код подтверждения на вашу почту. Введите его ниже.");
    setLoading(false);
  }

  function resetVerificationStep() {
    setNeedsVerification(false);
    setDraftEmail("");
    setDraftPassword("");
    setDraftReferralCode("");
    setDraftLegalAccepted(false);
    setInfo(null);
    setEmailError(null);
  }

  return (
    <main className="container" style={{ padding: "40px 0 64px", maxWidth: 520 }}>
      <h1 style={{ marginTop: 0 }}>Вход и регистрация</h1>
      <div style={{ marginBottom: 16 }}>
        <p style={{ margin: "0 0 8px", color: "#475569" }}>Быстрый вход через Telegram</p>
        {telegramBotUsername ? <div id="telegram-login-widget" /> : null}
        <p style={{ margin: "10px 0 0", color: "#475569", fontSize: 14 }}>
          Если Telegram-вход недоступен, используйте вход по email ниже.
        </p>
        {telegramError ? <p style={{ color: "#b91c1c", marginTop: 8 }}>{telegramError}</p> : null}
        {telegramUnavailable && !telegramError ? (
          <p style={{ color: "#b91c1c", marginTop: 8 }}>Telegram-вход временно недоступен. Используйте вход по email.</p>
        ) : null}
      </div>

      {!needsVerification ? (
        <p style={{ marginTop: 0, color: "#475569" }}>
          Введите email и пароль. Для нового email мы отправим код подтверждения, после чего создадим аккаунт и выполним вход.
        </p>
      ) : (
        <p style={{ marginTop: 0, color: "#475569" }}>
          Подтвердите email <strong>{draftEmail}</strong> кодом из письма.
        </p>
      )}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        {!needsVerification ? (
          <>
            <input required type="email" name="email" placeholder="Email" style={inputStyle} />
            <input required type="password" name="password" placeholder="Пароль" style={inputStyle} />
            <input name="referralCode" placeholder="Реферальный код (опционально)" style={inputStyle} />
            <label style={checkboxLabelStyle}>
              <input name="legalAccepted" type="checkbox" style={{ marginTop: 2 }} />
              <span>
                Я принимаю{" "}
                <Link href="/legal/terms" target="_blank" rel="noopener noreferrer" style={inlineLinkStyle}>
                  пользовательское соглашение
                </Link>{" "}
                и{" "}
                <Link href="/legal/privacy" target="_blank" rel="noopener noreferrer" style={inlineLinkStyle}>
                  политику конфиденциальности
                </Link>
                .
              </span>
            </label>
          </>
        ) : (
          <>
            <input
              required
              name="verificationCode"
              placeholder="Код из письма (6 цифр)"
              inputMode="numeric"
              pattern="[0-9]{6}"
              style={inputStyle}
            />
            <button type="button" onClick={resetVerificationStep} style={secondaryButtonStyle}>
              Изменить email
            </button>
          </>
        )}

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? "Проверяем..." : needsVerification ? "Подтвердить и войти" : "Продолжить"}
        </button>
      </form>

      {info ? <p style={{ color: "#166534" }}>{info}</p> : null}
      {emailError ? <p style={{ color: "#b91c1c" }}>{emailError}</p> : null}
    </main>
  );
}

const inputStyle: CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
};

const buttonStyle: CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#0f766e",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#fff",
  color: "#334155",
  fontWeight: 600,
  cursor: "pointer",
};

const checkboxLabelStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "18px 1fr",
  gap: 8,
  alignItems: "start",
  color: "#334155",
  fontSize: 14,
};

const inlineLinkStyle: CSSProperties = {
  color: "#0f766e",
  textDecoration: "underline",
};
