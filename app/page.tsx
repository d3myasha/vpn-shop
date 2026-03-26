import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function formatRub(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatDurationLabel(days: number) {
  if (days === 30) return "1 месяц";
  if (days === 90) return "3 месяца";
  if (days === 180) return "6 месяцев";
  if (days === 365) return "1 год";
  return `${days} дн.`;
}

function getPlanGroupKey(code: string) {
  const match = code.match(/^(.*)_((?:\d+[mdy])|(?:\d+d))$/i);
  if (!match) {
    return code;
  }
  return match[1];
}

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: [{ title: "asc" }, { durationDays: "asc" }],
    select: {
      id: true,
      code: true,
      title: true,
      description: true,
      durationDays: true,
      deviceLimit: true,
      limitType: true,
      trafficLimitGb: true,
      priceRub: true
    }
  });
  const grouped = new Map<
    string,
    {
      key: string;
      title: string;
      description: string | null;
      limitType: "DEVICES" | "TRAFFIC";
      deviceLimit: number;
      trafficLimitGb: number | null;
      options: Array<{ code: string; durationDays: number; priceRub: number }>;
    }
  >();

  for (const plan of plans) {
    const key = getPlanGroupKey(plan.code);
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        key,
        title: plan.title,
        description: plan.description,
        limitType: plan.limitType,
        deviceLimit: plan.deviceLimit,
        trafficLimitGb: plan.trafficLimitGb,
        options: [{ code: plan.code, durationDays: plan.durationDays, priceRub: plan.priceRub }]
      });
      continue;
    }
    current.options.push({ code: plan.code, durationDays: plan.durationDays, priceRub: plan.priceRub });
  }

  const planGroups = Array.from(grouped.values()).map((group) => ({
    ...group,
    options: group.options.sort((a, b) => a.durationDays - b.durationDays)
  }));

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
        {planGroups.map((group) => (
          <article
            key={group.key}
            style={{
              borderRadius: 14,
              border: "1px solid #e2e8f0",
              background: "#fff",
              padding: 16,
              boxShadow: "0 8px 28px rgba(15,23,42,0.05)"
            }}
          >
            <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>{group.title}</p>
            <h2 style={{ margin: "6px 0 10px", fontSize: 19 }}>Выбор срока</h2>
            <p style={{ margin: "0 0 4px", fontSize: 14 }}>
              {group.limitType === "TRAFFIC" ? `Трафик: ${group.trafficLimitGb ?? "—"} ГБ` : `Устройств: ${group.deviceLimit}`}
            </p>
            {group.description ? <p style={{ margin: "0 0 8px", fontSize: 13, color: "#64748b" }}>{group.description}</p> : null}
            <form action="/api/checkout" method="post">
              <select
                name="planCode"
                defaultValue={group.options[0]?.code}
                style={{
                  width: "100%",
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  padding: "8px 10px",
                  marginBottom: 8
                }}
              >
                {group.options.map((option) => (
                  <option key={option.code} value={option.code}>
                    {formatDurationLabel(option.durationDays)} - {formatRub(option.priceRub)} ₽
                  </option>
                ))}
              </select>
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
