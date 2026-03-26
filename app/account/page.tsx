import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";

const ACCOUNT_TABS = ["subscription", "payments"] as const;

type AccountTab = (typeof ACCOUNT_TABS)[number];

type SearchParams = Record<string, string | string[] | undefined>;

function resolveAccountTab(rawTab: string | undefined): AccountTab {
  if (rawTab && ACCOUNT_TABS.includes(rawTab as AccountTab)) {
    return rawTab as AccountTab;
  }

  return "subscription";
}

function readQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function accountTabHref(tab: AccountTab) {
  return `/account?tab=${tab}`;
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = await Promise.resolve(searchParams ?? {});
  const activeTab = resolveAccountTab(readQueryValue(params.tab));

  const [user, subscription, payments] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        email: true,
        role: true,
        referralCode: true,
      },
    }),
    prisma.subscription.findUnique({
      where: { userId: session.user.id },
      include: { plan: true },
    }),
    prisma.payment.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <main className="container" style={{ padding: "36px 0 64px" }}>
      <h1 style={{ marginTop: 0 }}>Личный кабинет</h1>
      <p style={{ marginBottom: 6 }}>Email: {user?.email}</p>
      <p style={{ marginBottom: 6 }}>Роль: {user?.role}</p>
      <p style={{ marginBottom: 18 }}>Ваш рефкод: {user?.referralCode}</p>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button type="submit" style={buttonStyle}>
          Выйти
        </button>
      </form>

      <div className="panel-layout" style={{ marginTop: 24 }}>
        <aside className="panel-sidebar">
          <p className="panel-sidebar-title">Разделы</p>
          <nav className="panel-nav" aria-label="Навигация кабинета">
            <Link
              href={accountTabHref("subscription")}
              className={`panel-nav-link ${activeTab === "subscription" ? "is-active" : ""}`}
            >
              Подписка
            </Link>
            <Link href={accountTabHref("payments")} className={`panel-nav-link ${activeTab === "payments" ? "is-active" : ""}`}>
              История платежей
            </Link>
          </nav>
        </aside>

        <section className="panel-content">
          <nav className="panel-mobile-tabs" aria-label="Навигация кабинета (мобильная)">
            <Link
              href={accountTabHref("subscription")}
              className={`panel-nav-link ${activeTab === "subscription" ? "is-active" : ""}`}
            >
              Подписка
            </Link>
            <Link href={accountTabHref("payments")} className={`panel-nav-link ${activeTab === "payments" ? "is-active" : ""}`}>
              Платежи
            </Link>
          </nav>

          {activeTab === "subscription" ? (
            <>
              <h2 style={{ marginTop: 0 }}>Подписка</h2>
              {!subscription ? <p>Подписки пока нет.</p> : null}
              <div style={{ display: "grid", gap: 10 }}>
                {subscription ? (
                  <article key={subscription.id} style={cardStyle}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{subscription.plan?.title ?? "IMPORTED / NONE"}</p>
                    <p style={{ margin: "4px 0" }}>Статус: {subscription.status}</p>
                    <p style={{ margin: "4px 0" }}>До: {new Date(subscription.expiresAt).toLocaleString("ru-RU")}</p>
                    <p style={{ margin: "4px 0" }}>Лимит устройств: {subscription.deviceLimitSnapshot}</p>
                    <p style={{ margin: "4px 0", wordBreak: "break-all" }}>
                      Ссылка подписки: {subscription.remnawaveSubscription ?? "еще не выдана"}
                    </p>
                  </article>
                ) : null}
              </div>
            </>
          ) : null}

          {activeTab === "payments" ? (
            <>
              <h2 style={{ marginTop: 0 }}>История платежей</h2>
              {payments.length === 0 ? <p>Платежей пока нет.</p> : null}
              <div style={{ display: "grid", gap: 10 }}>
                {payments.map((payment) => (
                  <article key={payment.id} style={cardStyle}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{payment.amountRub} ₽</p>
                    <p style={{ margin: "4px 0" }}>Статус: {payment.status}</p>
                    <p style={{ margin: "4px 0" }}>Скидка: {payment.discountRub} ₽</p>
                    <p style={{ margin: "4px 0" }}>Провайдер: {payment.provider}</p>
                    <p style={{ margin: "4px 0" }}>Дата: {new Date(payment.createdAt).toLocaleString("ru-RU")}</p>
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}

const buttonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "8px 12px",
  background: "#0f172a",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer"
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 12,
  background: "#fff"
};
