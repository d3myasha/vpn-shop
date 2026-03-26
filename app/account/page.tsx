import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";

const ACCOUNT_TABS = ["subscription", "payments", "referrals"] as const;

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

  const [user, subscription, payments, invitedCount, rewardsCount, invitedUsers, inviterRewards] = await Promise.all([
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
    prisma.user.count({
      where: { referredByUserId: session.user.id },
    }),
    prisma.referralReward.count({
      where: { inviterUserId: session.user.id },
    }),
    prisma.user.findMany({
      where: { referredByUserId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        createdAt: true,
      },
    }),
    prisma.referralReward.findMany({
      where: { inviterUserId: session.user.id },
      orderBy: { appliedAt: "desc" },
      select: {
        invitedUserId: true,
        inviterBonusDays: true,
        invitedBonusDays: true,
        appliedAt: true,
      },
    }),
  ]);
  const rewardsByInvitedUserId = new Map(inviterRewards.map((reward) => [reward.invitedUserId, reward]));

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
            <Link href={accountTabHref("referrals")} className={`panel-nav-link ${activeTab === "referrals" ? "is-active" : ""}`}>
              Рефералка
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
            <Link href={accountTabHref("referrals")} className={`panel-nav-link ${activeTab === "referrals" ? "is-active" : ""}`}>
              Рефералка
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

          {activeTab === "referrals" ? (
            <>
              <h2 style={{ marginTop: 0 }}>Реферальная система</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 12 }}>
                <article style={cardStyle}>
                  <p style={{ margin: "0 0 6px", color: "#64748b" }}>Приглашено пользователей</p>
                  <strong style={{ fontSize: 28 }}>{invitedCount}</strong>
                </article>
                <article style={cardStyle}>
                  <p style={{ margin: "0 0 6px", color: "#64748b" }}>Получено наград</p>
                  <strong style={{ fontSize: 28 }}>{rewardsCount}</strong>
                </article>
              </div>

              <h3 style={{ marginTop: 0 }}>История приглашений</h3>
              {invitedUsers.length === 0 ? <p>Вы пока никого не пригласили.</p> : null}
              <div style={{ display: "grid", gap: 10 }}>
                {invitedUsers.map((invitedUser) => {
                  const reward = rewardsByInvitedUserId.get(invitedUser.id);

                  return (
                    <article key={invitedUser.id} style={cardStyle}>
                      <p style={{ margin: 0, fontWeight: 600 }}>{invitedUser.email}</p>
                      <p style={{ margin: "4px 0" }}>Дата регистрации: {new Date(invitedUser.createdAt).toLocaleString("ru-RU")}</p>
                      {reward ? (
                        <>
                          <p style={{ margin: "4px 0", color: "#166534" }}>Статус: Награда начислена</p>
                          <p style={{ margin: "4px 0" }}>Дата начисления: {new Date(reward.appliedAt).toLocaleString("ru-RU")}</p>
                          <p style={{ margin: "4px 0" }}>
                            Бонусы: вам +{reward.inviterBonusDays} дн., приглашенному +{reward.invitedBonusDays} дн.
                          </p>
                        </>
                      ) : (
                        <p style={{ margin: "4px 0", color: "#92400e" }}>Статус: Ожидает первую успешную оплату</p>
                      )}
                    </article>
                  );
                })}
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
