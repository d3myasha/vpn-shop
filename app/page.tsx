import Link from "next/link";
import { auth } from "@/auth";
import { getBotPlans } from "@/lib/bot-db-adapter";

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

type SearchParams = Record<string, string | string[] | undefined>;

function readQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function getBuyHref(planCode: string, isAuthenticated: boolean) {
  const target = `/account?tab=subscription&planGroup=${encodeURIComponent(planCode)}`;
  if (isAuthenticated) {
    return target;
  }
  return `/login?next=${encodeURIComponent(target)}`;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const session = await auth();
  const isAuthenticated = Boolean(session?.user?.id);
  const params = await Promise.resolve(searchParams ?? {});
  const checkoutState = readQueryValue(params.checkout);
  const errorMessage = checkoutState === "disabled" ? "Покупка и оплата временно недоступна." : null;

  let plansError: string | null = null;
  let plans = [] as Awaited<ReturnType<typeof getBotPlans>>;

  try {
    plans = await getBotPlans();
  } catch {
    plansError = "Тарифы временно недоступны: нет соединения с backend бота.";
  }

  return (
    <main className="container" style={{ padding: "36px 0 60px" }}>
      <header style={{ marginBottom: 28, textAlign: "center" }}>
        <h1 style={{ margin: 0, fontSize: 36 }}>VPN Shop</h1>
        <p style={{ margin: "8px 0 0", color: "#334155" }}>Стабильный VPN с удобным управлением подпиской.</p>
        {errorMessage ? <p style={{ margin: "10px 0 0", color: "#b91c1c", fontWeight: 600 }}>{errorMessage}</p> : null}
        {plansError ? <p style={{ margin: "10px 0 0", color: "#b91c1c", fontWeight: 600 }}>{plansError}</p> : null}
      </header>

      <section id="about" style={sectionStyle}>
        <h2 style={sectionTitleStyle}>О нас</h2>
        <p style={sectionTextStyle}>
          Мы делаем VPN-сервис с простым запуском и понятной оплатой. Наша цель — дать стабильный доступ без сложной настройки и лишних шагов.
        </p>
      </section>

      <section id="features" style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Функции</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <article style={featureCardStyle}>
            <h3 style={featureTitleStyle}>Быстрая активация</h3>
            <p style={featureTextStyle}>После покупки в Telegram подписка автоматически обновится в личном кабинете.</p>
          </article>
          <article style={featureCardStyle}>
            <h3 style={featureTitleStyle}>Гибкие тарифы</h3>
            <p style={featureTextStyle}>Выбирайте подходящий срок и лимит устройств под свои задачи.</p>
          </article>
          <article style={featureCardStyle}>
            <h3 style={featureTitleStyle}>Управление устройствами</h3>
            <p style={featureTextStyle}>В кабинете можно отслеживать подключенные устройства и удалять лишние.</p>
          </article>
        </div>
      </section>

      <section
        id="tariffs"
        style={{
          ...sectionStyle,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12
        }}
      >
        {plans.map((plan) => (
          <article
            key={plan.id}
            style={{
              borderRadius: 14,
              border: "1px solid #e2e8f0",
              background: "#fff",
              padding: 16,
              boxShadow: "0 8px 28px rgba(15,23,42,0.05)"
            }}
          >
            <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>{plan.title}</p>
            <h2 style={{ margin: "6px 0 10px", fontSize: 19 }}>Тариф</h2>
            <p style={{ margin: "0 0 4px", fontSize: 14 }}>
              {plan.limitType === "TRAFFIC" ? `Трафик: ${plan.trafficLimitGb ?? "—"} ГБ` : `Устройств: ${plan.deviceLimit}`}
            </p>
            {plan.description ? <p style={{ margin: "0 0 8px", fontSize: 13, color: "#64748b" }}>{plan.description}</p> : null}
            {plan.options.length > 0 ? (
              <p style={{ margin: "8px 0", fontSize: 13, color: "#334155" }}>
                {plan.options.map((option) => `${formatDurationLabel(option.days)} — ${formatRub(option.priceRub)} ₽`).join(" • ")}
              </p>
            ) : (
              <p style={{ margin: "8px 0", fontSize: 13, color: "#334155" }}>Стоимость уточняйте в боте</p>
            )}
            <Link href={getBuyHref(plan.publicCode, isAuthenticated)} style={buyButtonStyle}>
              Купить
            </Link>
          </article>
        ))}
      </section>

      <section id="reviews" style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Отзывы</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          <article style={featureCardStyle}>
            <p style={featureTextStyle}>«Подключил за пару минут. Работает стабильно и без лишней возни.»</p>
            <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: 13 }}>Иван</p>
          </article>
          <article style={featureCardStyle}>
            <p style={featureTextStyle}>«Удобный личный кабинет, можно быстро продлить подписку.»</p>
            <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: 13 }}>Мария</p>
          </article>
          <article style={featureCardStyle}>
            <p style={featureTextStyle}>«Понравилась простая оплата и автоактивация после покупки.»</p>
            <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: 13 }}>Артем</p>
          </article>
        </div>
      </section>
    </main>
  );
}

const sectionStyle: React.CSSProperties = {
  marginBottom: 28
};

const sectionTitleStyle: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 28
};

const sectionTextStyle: React.CSSProperties = {
  margin: 0,
  color: "#334155",
  lineHeight: 1.6
};

const featureCardStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  background: "#fff",
  padding: 14
};

const featureTitleStyle: React.CSSProperties = {
  margin: "0 0 6px",
  fontSize: 18
};

const featureTextStyle: React.CSSProperties = {
  margin: 0,
  color: "#334155",
  lineHeight: 1.5
};

const buyButtonStyle: React.CSSProperties = {
  display: "inline-block",
  width: "100%",
  textAlign: "center",
  border: "none",
  borderRadius: 10,
  cursor: "pointer",
  background: "#0f766e",
  color: "#fff",
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: 600
};
