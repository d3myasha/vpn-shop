"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      referralCode: String(form.get("referralCode") ?? "")
    };

    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Не удалось создать аккаунт");
      setLoading(false);
      return;
    }

    router.push("/login?registered=1");
  }

  return (
    <main className="container" style={{ padding: "40px 0 64px", maxWidth: 520 }}>
      <h1 style={{ marginTop: 0 }}>Регистрация</h1>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <input required type="email" name="email" placeholder="Email" style={inputStyle} />
        <input required minLength={8} type="password" name="password" placeholder="Пароль (минимум 8 символов)" style={inputStyle} />
        <input name="referralCode" placeholder="Реферальный код (опционально)" style={inputStyle} />
        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? "Создаем..." : "Создать аккаунт"}
        </button>
      </form>
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
