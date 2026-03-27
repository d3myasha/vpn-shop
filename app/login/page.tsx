"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

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

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [draftEmail, setDraftEmail] = useState("");
  const [draftPassword, setDraftPassword] = useState("");
  const [draftReferralCode, setDraftReferralCode] = useState("");
  const [draftLegalAccepted, setDraftLegalAccepted] = useState(false);
  const nextPath = resolveNextPath(searchParams.get("next"));

  async function signInWithCredentials(email: string, password: string) {
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (!result || result.error) {
      setError("Неверный email или пароль");
      return false;
    }

    window.location.href = nextPath;
    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
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
        setError(data.error ?? "Не удалось завершить регистрацию");
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
      setError(data.error ?? "Не удалось продолжить");
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
    setError(null);
  }

  return (
    <main className="container" style={{ padding: "40px 0 64px", maxWidth: 520 }}>
      <h1 style={{ marginTop: 0 }}>Вход и регистрация</h1>
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
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14
};

const buttonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#0f766e",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer"
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#fff",
  color: "#334155",
  fontWeight: 600,
  cursor: "pointer",
};

const checkboxLabelStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "18px 1fr",
  gap: 8,
  alignItems: "start",
  color: "#334155",
  fontSize: 14,
};

const inlineLinkStyle: React.CSSProperties = {
  color: "#0f766e",
  textDecoration: "underline",
};
