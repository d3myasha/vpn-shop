"use client";

import { useState, type CSSProperties } from "react";

type LinkEmailCardProps = {
  currentEmail: string | null;
};

export function LinkEmailCard({ currentEmail }: LinkEmailCardProps) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(currentEmail ?? "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"request" | "confirm">(currentEmail ? "confirm" : "request");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function requestCode() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/account/link-email/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Не удалось отправить код");
        return;
      }
      setStep("confirm");
      setSuccess("Код отправлен на email. Введите код и задайте пароль.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmLink() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/account/link-email/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, password }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Не удалось привязать email");
        return;
      }
      setSuccess("Email успешно привязан к аккаунту.");
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  return (
    <article style={cardStyle}>
      <p style={{ marginTop: 0, marginBottom: 8, fontWeight: 600 }}>Привязка email</p>
      <p style={{ marginTop: 0, marginBottom: 12, color: "#475569" }}>
        Привяжите email к Telegram-аккаунту, чтобы входить и по Telegram, и по email/паролю.
      </p>

      <div style={{ display: "grid", gap: 8 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          style={inputStyle}
        />

        {step === "confirm" ? (
          <>
            <input
              placeholder="Код из письма (6 цифр)"
              inputMode="numeric"
              pattern="[0-9]{6}"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Новый пароль"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={inputStyle}
            />
          </>
        ) : null}
      </div>

      {error ? <p style={{ margin: "10px 0 0", color: "#b91c1c" }}>{error}</p> : null}
      {success ? <p style={{ margin: "10px 0 0", color: "#166534" }}>{success}</p> : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {step === "request" ? (
          <button
            type="button"
            onClick={requestCode}
            disabled={loading || !email.trim()}
            style={buttonStyle}
          >
            {loading ? "Отправляем..." : "Запросить код"}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={confirmLink}
              disabled={loading || !email.trim() || !code.trim() || !password}
              style={buttonStyle}
            >
              {loading ? "Проверяем..." : "Подтвердить и привязать"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("request");
                setCode("");
                setPassword("");
                setError(null);
                setSuccess(null);
              }}
              style={secondaryButtonStyle}
            >
              Изменить email
            </button>
          </>
        )}
      </div>
    </article>
  );
}

const cardStyle: CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 12,
  background: "#fff",
};

const buttonStyle: CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "8px 12px",
  background: "#0f172a",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "8px 12px",
  background: "#fff",
  color: "#0f172a",
  fontWeight: 600,
  cursor: "pointer",
};

const inputStyle: CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "8px 10px",
};
