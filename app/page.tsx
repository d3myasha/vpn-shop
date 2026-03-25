import { PLAN_CARDS } from "@/lib/plans";
import Link from "next/link";
import { auth } from "@/auth";

function formatRub(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export default async function HomePage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "OWNER" || session?.user?.role === "ADMIN";

  return (
    <main className="container" style={{ padding: "36px 0 60px" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 36 }}>VPN подписки</h1>
        <p style={{ margin: "8px 0 0", color: "#334155" }}>Безлимитный трафик, автоматическая выдача ссылки после оплаты.</p>
        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!session?.user ? (
            <>
              <Link href="/login" style={navLinkStyle}>
                Вход
              </Link>
              <Link href="/register" style={navLinkStyle}>
                Регистрация
              </Link>
            </>
          ) : (
            <>
              <Link href="/account" style={navLinkStyle}>
                Личный кабинет
              </Link>
              {isAdmin ? (
                <Link href="/admin" style={navLinkStyle}>
                  Админка
                </Link>
              ) : null}
            </>
          )}
        </div>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12
        }}
      >
        {PLAN_CARDS.map((plan) => (
          <article
            key={plan.code}
            style={{
              borderRadius: 14,
              border: "1px solid #e2e8f0",
              background: "#fff",
              padding: 16,
              boxShadow: "0 8px 28px rgba(15,23,42,0.05)"
            }}
          >
            <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>{plan.groupTitle}</p>
            <h2 style={{ margin: "6px 0 10px", fontSize: 19 }}>{plan.durationLabel}</h2>
            <p style={{ margin: "0 0 4px", fontSize: 14 }}>Устройств: {plan.deviceLimit}</p>
            <p style={{ margin: "0 0 16px", fontWeight: 600, fontSize: 22 }}>{formatRub(plan.priceRub)} ₽</p>
            <form action="/api/checkout" method="post">
              <input type="hidden" name="planCode" value={plan.code} />
              <input
                name="promoCode"
                placeholder="Промокод (опционально)"
                style={{
                  width: "100%",
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  padding: "8px 10px",
                  marginBottom: 8
                }}
              />
              <input
                name="referralCode"
                placeholder="Рефкод (опционально)"
                style={{
                  width: "100%",
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  padding: "8px 10px",
                  marginBottom: 8
                }}
              />
              <button
                type="submit"
                style={{
                  width: "100%",
                  border: "none",
                  borderRadius: 10,
                  cursor: "pointer",
                  background: "#0f766e",
                  color: "#fff",
                  padding: "10px 12px",
                  fontSize: 14,
                  fontWeight: 600
                }}
              >
                Оплатить
              </button>
            </form>
          </article>
        ))}
      </section>
    </main>
  );
}

const navLinkStyle: React.CSSProperties = {
  display: "inline-block",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "8px 12px",
  background: "#fff",
  fontSize: 14
};
