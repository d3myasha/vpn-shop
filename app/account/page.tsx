import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deleteUserHwidDevice, getUserHwidDevices, resolveRemnawaveUserUuidByEmail, type RemnawaveDevice } from "@/lib/remnawave";

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

function getDeviceActionMessage(action: string | undefined) {
  if (action === "deleted") {
    return { text: "Устройство удалено.", color: "#166534" };
  }
  if (action === "delete_failed") {
    return { text: "Не удалось удалить устройство. Попробуйте еще раз.", color: "#b91c1c" };
  }
  if (action === "profile_missing") {
    return { text: "Профиль Remnawave пока не найден. Попробуйте позже.", color: "#92400e" };
  }
  if (action === "no_subscription") {
    return { text: "Подписка не найдена.", color: "#92400e" };
  }

  return null;
}

function formatDeviceLabel(device: RemnawaveDevice) {
  const parts = [device.deviceModel, device.platform, device.osVersion].map((part) => part?.trim()).filter(Boolean);
  if (parts.length === 0) {
    return "Неизвестное устройство";
  }
  return parts.join(" • ");
}

function shortHwid(hwid: string) {
  if (hwid.length <= 16) {
    return hwid;
  }
  return `${hwid.slice(0, 8)}...${hwid.slice(-8)}`;
}

async function resolveSubscriptionRemnawaveUserUuid(params: {
  subscriptionId: string;
  remnawaveProfileId: string | null;
  email: string;
}) {
  if (params.remnawaveProfileId) {
    return params.remnawaveProfileId;
  }

  const resolvedUuid = await resolveRemnawaveUserUuidByEmail(params.email);
  if (!resolvedUuid) {
    return null;
  }

  await prisma.subscription.update({
    where: { id: params.subscriptionId },
    data: { remnawaveProfileId: resolvedUuid },
  });

  return resolvedUuid;
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
  const deviceActionMessage = getDeviceActionMessage(readQueryValue(params.deviceAction));

  async function deleteDeviceAction(formData: FormData) {
    "use server";

    const actor = await auth();
    if (!actor?.user?.id) {
      redirect("/login");
    }

    const hwid = String(formData.get("hwid") ?? "").trim();
    if (!hwid) {
      redirect("/account?tab=subscription&deviceAction=delete_failed");
    }

    const [actorUser, actorSubscription] = await Promise.all([
      prisma.user.findUnique({
        where: { id: actor.user.id },
        select: { email: true },
      }),
      prisma.subscription.findUnique({
        where: { userId: actor.user.id },
        select: { id: true, remnawaveProfileId: true },
      }),
    ]);

    if (!actorUser?.email || !actorSubscription) {
      redirect("/account?tab=subscription&deviceAction=no_subscription");
    }

    const userUuid = await resolveSubscriptionRemnawaveUserUuid({
      subscriptionId: actorSubscription.id,
      remnawaveProfileId: actorSubscription.remnawaveProfileId,
      email: actorUser.email,
    });
    if (!userUuid) {
      redirect("/account?tab=subscription&deviceAction=profile_missing");
    }

    try {
      await deleteUserHwidDevice(userUuid, hwid);
      revalidatePath("/account");
      redirect("/account?tab=subscription&deviceAction=deleted");
    } catch {
      redirect("/account?tab=subscription&deviceAction=delete_failed");
    }
  }

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

  let remnawaveDevices: RemnawaveDevice[] = [];
  let remnawaveUserUuid: string | null = null;
  let devicesLoadError: string | null = null;

  if (subscription && user?.email) {
    try {
      remnawaveUserUuid = await resolveSubscriptionRemnawaveUserUuid({
        subscriptionId: subscription.id,
        remnawaveProfileId: subscription.remnawaveProfileId,
        email: user.email,
      });

      if (remnawaveUserUuid) {
        remnawaveDevices = await getUserHwidDevices(remnawaveUserUuid);
      }
    } catch {
      devicesLoadError = "Не удалось загрузить устройства из Remnawave.";
    }
  }

  const freeDeviceSlots = subscription ? Math.max(0, subscription.deviceLimitSnapshot - remnawaveDevices.length) : 0;

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
              {deviceActionMessage ? <p style={{ marginTop: 0, color: deviceActionMessage.color }}>{deviceActionMessage.text}</p> : null}
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

              {subscription ? (
                <>
                  <h3 style={{ marginTop: 20 }}>Мои устройства</h3>
                  {devicesLoadError ? <p style={{ color: "#b91c1c", marginTop: 0 }}>{devicesLoadError}</p> : null}
                  {!remnawaveUserUuid ? <p style={{ marginTop: 0 }}>Профиль Remnawave пока не найден.</p> : null}

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 10 }}>
                    <article style={cardStyle}>
                      <p style={{ margin: "0 0 6px", color: "#64748b" }}>Лимит устройств</p>
                      <strong style={{ fontSize: 24 }}>{subscription.deviceLimitSnapshot}</strong>
                    </article>
                    <article style={cardStyle}>
                      <p style={{ margin: "0 0 6px", color: "#64748b" }}>Добавлено устройств</p>
                      <strong style={{ fontSize: 24 }}>{remnawaveDevices.length}</strong>
                    </article>
                    <article style={cardStyle}>
                      <p style={{ margin: "0 0 6px", color: "#64748b" }}>Свободно</p>
                      <strong style={{ fontSize: 24 }}>{freeDeviceSlots}</strong>
                    </article>
                  </div>

                  {remnawaveUserUuid && remnawaveDevices.length === 0 ? <p>Устройств пока нет.</p> : null}
                  <div style={{ display: "grid", gap: 10 }}>
                    {remnawaveDevices.map((device) => (
                      <article key={device.hwid} style={cardStyle}>
                        <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{formatDeviceLabel(device)}</p>
                        <p style={{ margin: "4px 0", color: "#475569" }}>HWID: {shortHwid(device.hwid)}</p>
                        <p style={{ margin: "4px 0" }}>Добавлено: {new Date(device.createdAt).toLocaleString("ru-RU")}</p>
                        <form action={deleteDeviceAction} style={{ marginTop: 8 }}>
                          <input type="hidden" name="hwid" value={device.hwid} />
                          <button type="submit" style={dangerButtonStyle}>
                            Удалить устройство
                          </button>
                        </form>
                      </article>
                    ))}
                  </div>
                </>
              ) : null}
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

const dangerButtonStyle: React.CSSProperties = {
  border: "1px solid #ef4444",
  borderRadius: 8,
  background: "#fff",
  color: "#b91c1c",
  padding: "6px 10px",
  cursor: "pointer"
};
