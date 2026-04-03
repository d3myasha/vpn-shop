import Link from "next/link";
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

type SearchParams = Record<string, string | string[] | undefined>;
type PlanGroup = {
  key: string;
  title: string;
  description: string | null;
  limitType: "DEVICES" | "TRAFFIC";
  deviceLimit: number;
  trafficLimitGb: number | null;
  options: Array<{ code: string; durationDays: number; priceRub: number }>;
};

function readQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function buildPlanGroups(
  plans: Array<{
    code: string;
    title: string;
    description: string | null;
    durationDays: number;
    deviceLimit: number;
    limitType: "DEVICES" | "TRAFFIC";
    trafficLimitGb: number | null;
    priceRub: number;
  }>
) {
  const grouped = new Map<string, PlanGroup>();
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

  return Array.from(grouped.values()).map((group) => ({
    ...group,
    options: group.options.sort((a, b) => a.durationDays - b.durationDays)
  }));
}

function getBuyHref(planGroup: string, isAuthenticated: boolean) {
  const target = `/account?tab=subscription&planGroup=${encodeURIComponent(planGroup)}`;
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
  return <HomePageView errorMessage={errorMessage} isAuthenticated={isAuthenticated} />;
}

async function HomePageView({ errorMessage, isAuthenticated }: { errorMessage: string | null; isAuthenticated: boolean }) {
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
  const planGroups = buildPlanGroups(plans);

  return (
    <main className="container" style={{ padding: "36px 0 60px" }}>
      <header style={{ marginBottom: 28, textAlign: "center" }}>
        <h1 style={{ margin: 0, fontSize: 36 }}>VPN Shop</h1>
        <p style={{ margin: "8px 0 0", color: "#334155" }}>Стабильный VPN с удобным управлением подпиской.</p>
        {errorMessage ? <p style={{ margin: "10px 0 0", color: "#b91c1c", fontWeight: 600 }}>{errorMessage}</p> : null}
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
            <p style={featureTextStyle}>После оплаты подписка автоматически появляется в личном кабинете.</p>
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
            <h2 style={{ margin: "6px 0 10px", fontSize: 19 }}>Тарифы</h2>
            <p style={{ margin: "0 0 4px", fontSize: 14 }}>
              {group.limitType === "TRAFFIC" ? `Трафик: ${group.trafficLimitGb ?? "—"} ГБ` : `Устройств: ${group.deviceLimit}`}
            </p>
            {group.description ? <p style={{ margin: "0 0 8px", fontSize: 13, color: "#64748b" }}>{group.description}</p> : null}
            <p style={{ margin: "8px 0", fontSize: 13, color: "#334155" }}>
              {group.options.map((option) => `${formatDurationLabel(option.durationDays)} — ${formatRub(option.priceRub)} ₽`).join(" • ")}
            </p>
            <Link href={getBuyHref(group.key, isAuthenticated)} style={buyButtonStyle}>
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
