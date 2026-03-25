import { PLAN_CARDS } from "@/lib/plans";

function formatRub(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export default function HomePage() {
  return (
    <main className="container" style={{ padding: "36px 0 60px" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 36 }}>VPN подписки</h1>
        <p style={{ margin: "8px 0 0", color: "#334155" }}>Безлимитный трафик, автоматическая выдача ссылки после оплаты.</p>
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
