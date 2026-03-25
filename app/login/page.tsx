"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false
    });

    if (!result || result.error) {
      setError("Неверный email или пароль");
      setLoading(false);
      return;
    }

    window.location.href = "/account";
  }

  return (
    <main className="container" style={{ padding: "40px 0 64px", maxWidth: 520 }}>
      <h1 style={{ marginTop: 0 }}>Вход</h1>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <input required type="email" name="email" placeholder="Email" style={inputStyle} />
        <input required type="password" name="password" placeholder="Пароль" style={inputStyle} />
        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? "Входим..." : "Войти"}
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
