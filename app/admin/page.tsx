import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listRemnawaveSquads, syncRemnawaveSubscription } from "@/lib/remnawave";
import { getOrCreateReferralSettings, REFERRAL_SETTINGS_ID } from "@/lib/referral-settings";
import { PlanLimitType, PlanTier, UserRole } from "@prisma/client";

const ROLE_OPTIONS: UserRole[] = ["CUSTOMER", "ADMIN", "OWNER"];
const PLAN_TIER_OPTIONS: PlanTier[] = ["SIMPLE", "EXTENDED", "SUPER", "CUSTOM"];
const PLAN_LIMIT_OPTIONS: PlanLimitType[] = ["DEVICES", "TRAFFIC"];
const ADMIN_TABS = ["users", "plans", "promocodes", "referrals"] as const;

type AdminTab = (typeof ADMIN_TABS)[number];
type SearchParams = Record<string, string | string[] | undefined>;

function readQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function resolveAdminTab(rawTab: string | undefined): AdminTab {
  if (rawTab && ADMIN_TABS.includes(rawTab as AdminTab)) {
    return rawTab as AdminTab;
  }

  return "users";
}

function adminTabHref(tab: AdminTab) {
  return `/admin?tab=${tab}`;
}

function formatPlanTier(tier: PlanTier) {
  if (tier === "SIMPLE") return "Simple";
  if (tier === "EXTENDED") return "Extended";
  if (tier === "SUPER") return "Super";
  return "Custom";
}

function formatPlanLimitType(limitType: PlanLimitType) {
  return limitType === "TRAFFIC" ? "Трафик" : "Устройства";
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

function getDurationCode(days: number) {
  if (days === 30) return "1m";
  if (days === 90) return "3m";
  if (days === 180) return "6m";
  if (days === 365) return "12m";
  return `${days}d`;
}

function parseDurationPrices(raw: string) {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error("Укажи хотя бы один срок в формате дни:цена.");
  }

  const entries: Array<{ durationDays: number; priceRub: number }> = [];
  for (const line of lines) {
    const [daysRaw, priceRaw] = line.split(":").map((x) => x?.trim() ?? "");
    const durationDays = Number(daysRaw);
    const priceRub = Number(priceRaw);

    if (!Number.isInteger(durationDays) || durationDays <= 0) {
      throw new Error(`Некорректная длительность в строке: ${line}`);
    }
    if (!Number.isInteger(priceRub) || priceRub <= 0) {
      throw new Error(`Некорректная цена в строке: ${line}`);
    }

    entries.push({ durationDays, priceRub });
  }

  const uniq = new Map<number, number>();
  for (const entry of entries) {
    uniq.set(entry.durationDays, entry.priceRub);
  }

  return Array.from(uniq.entries())
    .map(([durationDays, priceRub]) => ({ durationDays, priceRub }))
    .sort((a, b) => a.durationDays - b.durationDays);
}

function toDurationPricesText(options: Array<{ durationDays: number; priceRub: number }>) {
  return options.map((option) => `${option.durationDays}:${option.priceRub}`).join("\n");
}

function randomPromoCode(prefix: string, length: number) {
  const symbols = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let body = "";
  for (let i = 0; i < length; i += 1) {
    body += symbols[Math.floor(Math.random() * symbols.length)];
  }

  if (!prefix) {
    return body;
  }
  return `${prefix}-${body}`;
}

function formatPromoDiscount(discountPercent: number | null, discountRub: number | null) {
  if (discountPercent) {
    return `${discountPercent}%`;
  }
  if (discountRub) {
    return `${discountRub} ₽`;
  }
  return "—";
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user || role !== "OWNER") {
    redirect("/account");
  }
  const params = await Promise.resolve(searchParams ?? {});
  const activeTab = resolveAdminTab(readQueryValue(params.tab));

  async function updateUserRoleAction(formData: FormData) {
    "use server";

    const actor = await auth();
    if (actor?.user?.role !== "OWNER") {
      throw new Error("Только OWNER может менять роли.");
    }

    const userId = String(formData.get("userId") ?? "");
    const nextRole = String(formData.get("nextRole") ?? "") as UserRole;
    if (!userId || !ROLE_OPTIONS.includes(nextRole)) {
      throw new Error("Некорректные данные формы.");
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true }
    });
    if (!target) {
      throw new Error("Пользователь не найден.");
    }

    if (target.id === actor.user.id && nextRole !== "OWNER") {
      throw new Error("Нельзя снять роль OWNER с самого себя.");
    }

    if (target.role === "OWNER" && nextRole !== "OWNER") {
      const ownersCount = await prisma.user.count({ where: { role: "OWNER" } });
      if (ownersCount <= 1) {
        throw new Error("Нельзя понизить последнего OWNER.");
      }
    }

    await prisma.user.update({ where: { id: target.id }, data: { role: nextRole } });

    revalidatePath("/admin");
  }

  async function upsertPlanGroupAction(formData: FormData) {
    "use server";

    const actor = await auth();
    if (!actor?.user || actor.user.role !== "OWNER") {
      throw new Error("Нет прав для управления тарифами.");
    }

    const groupCode = String(formData.get("groupCode") ?? "")
      .trim()
      .toLowerCase();
    if (!groupCode || !/^[a-z0-9_-]{2,40}$/.test(groupCode)) {
      throw new Error("Код группы должен быть 2-40 символов: a-z, 0-9, _ или -.");
    }

    const title = String(formData.get("title") ?? "").trim();
    if (!title) {
      throw new Error("Название тарифа обязательно.");
    }

    const description = String(formData.get("description") ?? "").trim() || null;
    const tier = String(formData.get("tier") ?? "") as PlanTier;
    if (!PLAN_TIER_OPTIONS.includes(tier)) {
      throw new Error("Некорректный tier.");
    }

    const limitType = String(formData.get("limitType") ?? "") as PlanLimitType;
    if (!PLAN_LIMIT_OPTIONS.includes(limitType)) {
      throw new Error("Некорректный тип лимита.");
    }

    const deviceLimit = Number(formData.get("deviceLimit") ?? 1);
    if (!Number.isInteger(deviceLimit) || deviceLimit <= 0) {
      throw new Error("Лимит устройств должен быть целым числом > 0.");
    }

    const trafficLimitGbRaw = Number(formData.get("trafficLimitGb") ?? 0);
    const trafficLimitGb = limitType === "TRAFFIC" ? trafficLimitGbRaw : null;
    if (limitType === "TRAFFIC" && (!Number.isInteger(trafficLimitGbRaw) || trafficLimitGbRaw <= 0)) {
      throw new Error("Для TRAFFIC укажи лимит трафика в ГБ (целое число > 0).");
    }

    const internalSquadUuid = String(formData.get("internalSquadUuid") ?? "").trim() || null;
    const externalSquadUuid = String(formData.get("externalSquadUuid") ?? "").trim() || null;
    const isActive = String(formData.get("isActive") ?? "").toLowerCase() === "on";

    const durationPrices = parseDurationPrices(String(formData.get("durationPrices") ?? ""));

    const nextCodes = new Set<string>();

    for (const option of durationPrices) {
      const code = `${groupCode}_${getDurationCode(option.durationDays)}`;
      nextCodes.add(code);

      await prisma.plan.upsert({
        where: { code },
        create: {
          code,
          tier,
          title,
          description,
          limitType,
          durationDays: option.durationDays,
          deviceLimit,
          trafficLimitGb,
          priceRub: option.priceRub,
          internalSquadUuid,
          externalSquadUuid,
          isActive
        },
        update: {
          tier,
          title,
          description,
          limitType,
          durationDays: option.durationDays,
          deviceLimit,
          trafficLimitGb,
          priceRub: option.priceRub,
          internalSquadUuid,
          externalSquadUuid,
          isActive
        }
      });
    }

    const existingGroupPlans = await prisma.plan.findMany({
      where: { code: { startsWith: `${groupCode}_` } },
      select: { code: true }
    });

    const staleCodes = existingGroupPlans.map((plan) => plan.code).filter((code) => !nextCodes.has(code));
    if (staleCodes.length > 0) {
      await prisma.plan.updateMany({
        where: { code: { in: staleCodes } },
        data: { isActive: false }
      });
    }

    revalidatePath("/admin");
    revalidatePath("/");
  }

  async function togglePlanGroupActiveAction(formData: FormData) {
    "use server";

    const actor = await auth();
    if (!actor?.user || actor.user.role !== "OWNER") {
      throw new Error("Нет прав для управления тарифами.");
    }

    const planIdsRaw = String(formData.get("planIds") ?? "").trim();
    const nextIsActive = String(formData.get("nextIsActive") ?? "").toLowerCase() === "true";
    const planIds = planIdsRaw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (planIds.length === 0) {
      throw new Error("Не переданы planIds группы.");
    }

    await prisma.plan.updateMany({
      where: { id: { in: planIds } },
      data: { isActive: nextIsActive }
    });

    revalidatePath("/admin");
    revalidatePath("/");
  }

  async function deletePlanGroupAction(formData: FormData) {
    "use server";

    const actor = await auth();
    if (!actor?.user || actor.user.role !== "OWNER") {
      throw new Error("Нет прав для удаления тарифов.");
    }

    const planIdsRaw = String(formData.get("planIds") ?? "").trim();
    const planIds = planIdsRaw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (planIds.length === 0) {
      throw new Error("Не переданы planIds группы.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.subscription.updateMany({
        where: { planId: { in: planIds } },
        data: { planId: null }
      });

      await tx.plan.deleteMany({
        where: { id: { in: planIds } }
      });
    });

    revalidatePath("/admin");
    revalidatePath("/");
  }

  async function syncRemnawaveUsersAction() {
    "use server";

    const actor = await auth();
    if (!actor?.user || actor.user.role !== "OWNER") {
      throw new Error("Нет прав для синхронизации с Remnawave.");
    }

    const activeSubscriptions = await prisma.subscription.findMany({
      where: { status: "ACTIVE" },
      include: {
        user: true,
        plan: {
          select: {
            internalSquadUuid: true,
            externalSquadUuid: true
          }
        }
      }
    });

    for (const subscription of activeSubscriptions) {
      try {
        const remnawaveResult = await syncRemnawaveSubscription({
          email: subscription.user.email,
          expiresAt: subscription.expiresAt,
          deviceLimit: subscription.deviceLimitSnapshot,
          internalSubscriptionId: subscription.id,
          remnawaveProfileId: subscription.remnawaveProfileId,
          internalSquadUuid: subscription.plan?.internalSquadUuid ?? null,
          externalSquadUuid: subscription.plan?.externalSquadUuid ?? null
        });

        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            remnawaveProfileId: remnawaveResult.remnawaveUserUuid,
            remnawaveSubscription: remnawaveResult.subscriptionUrl
          }
        });
      } catch (error) {
        console.error("remnawave_sync_failed", subscription.id, error);
      }
    }

    revalidatePath("/admin");
  }

  async function generatePromoCodesAction(formData: FormData) {
    "use server";

    const actor = await auth();
    if (!actor?.user || actor.user.role !== "OWNER") {
      throw new Error("Нет прав для генерации промокодов.");
    }

    const quantity = Number(formData.get("quantity") ?? 1);
    const prefix = String(formData.get("prefix") ?? "")
      .toUpperCase()
      .trim()
      .replace(/[^A-Z0-9_-]/g, "")
      .slice(0, 12);
    const codeLength = Number(formData.get("codeLength") ?? 8);
    const discountType = String(formData.get("discountType") ?? "PERCENT");
    const discountValue = Number(formData.get("discountValue") ?? 0);
    const oneTime = String(formData.get("oneTime") ?? "").toLowerCase() === "on";
    const maxActivationsRaw = Number(formData.get("maxActivations") ?? 1);
    const validUntilRaw = String(formData.get("validUntil") ?? "");
    const isActive = String(formData.get("isActive") ?? "").toLowerCase() === "on";

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      throw new Error("Количество промокодов должно быть от 1 до 100.");
    }
    if (!Number.isInteger(codeLength) || codeLength < 4 || codeLength > 24) {
      throw new Error("Длина кода должна быть от 4 до 24.");
    }
    if (!Number.isInteger(discountValue) || discountValue <= 0) {
      throw new Error("Значение скидки должно быть целым числом больше 0.");
    }

    const validUntil = new Date(validUntilRaw);
    if (!validUntilRaw || Number.isNaN(validUntil.getTime()) || validUntil <= new Date()) {
      throw new Error("Укажи корректную будущую дату окончания действия.");
    }

    const maxActivations = oneTime ? 1 : maxActivationsRaw;
    if (!Number.isInteger(maxActivations) || maxActivations < 1 || maxActivations > 100000) {
      throw new Error("maxActivations должно быть от 1 до 100000.");
    }

    const discountPercent = discountType === "PERCENT" ? discountValue : null;
    const discountRub = discountType === "RUB" ? discountValue : null;
    if (!discountPercent && !discountRub) {
      throw new Error("Некорректный тип скидки.");
    }
    if (discountPercent && discountPercent > 99) {
      throw new Error("Скидка в процентах должна быть не более 99.");
    }

    for (let i = 0; i < quantity; i += 1) {
      let created = false;
      let attempt = 0;
      while (!created && attempt < 20) {
        attempt += 1;
        const code = randomPromoCode(prefix, codeLength);

        try {
          await prisma.promoCode.create({
            data: {
              code,
              discountPercent,
              discountRub,
              maxActivations,
              validUntil,
              isActive,
              createdByUserId: actor.user.id
            }
          });
          created = true;
        } catch (error: unknown) {
          if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "P2002") {
            continue;
          }
          throw error;
        }
      }

      if (!created) {
        throw new Error("Не удалось сгенерировать уникальные коды, попробуй изменить префикс/длину.");
      }
    }

    revalidatePath("/admin");
  }

  async function updateReferralSettingsAction(formData: FormData) {
    "use server";

    const actor = await auth();
    if (!actor?.user || actor.user.role !== "OWNER") {
      throw new Error("Нет прав для изменения настроек рефералки.");
    }

    const inviterBonusDays = Number(formData.get("inviterBonusDays") ?? 0);
    const invitedBonusDays = Number(formData.get("invitedBonusDays") ?? 0);

    if (!Number.isInteger(inviterBonusDays) || inviterBonusDays < 1) {
      throw new Error("Награда приглашающему должна быть целым числом >= 1.");
    }
    if (!Number.isInteger(invitedBonusDays) || invitedBonusDays < 1) {
      throw new Error("Награда приглашенному должна быть целым числом >= 1.");
    }

    await prisma.referralSettings.upsert({
      where: { id: REFERRAL_SETTINGS_ID },
      create: {
        id: REFERRAL_SETTINGS_ID,
        inviterBonusDays,
        invitedBonusDays
      },
      update: {
        inviterBonusDays,
        invitedBonusDays
      }
    });

    revalidatePath("/admin");
  }

  const [usersCount, paymentsCount, activeSubscriptions, users, plans, promoCodes] = await Promise.all([
    prisma.user.count(),
    prisma.payment.count(),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, role: true, createdAt: true }
    }),
    prisma.plan.findMany({ orderBy: [{ title: "asc" }, { durationDays: "asc" }] }),
    prisma.promoCode.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        createdBy: {
          select: { email: true }
        }
      }
    })
  ]);

  const groupedPlans = new Map<
    string,
    {
      groupCode: string;
      title: string;
      description: string | null;
      tier: PlanTier;
      limitType: PlanLimitType;
      deviceLimit: number;
      trafficLimitGb: number | null;
      internalSquadUuid: string | null;
      externalSquadUuid: string | null;
      isActive: boolean;
      options: Array<{ id: string; code: string; durationDays: number; priceRub: number; isActive: boolean }>;
    }
  >();

  for (const plan of plans) {
    const groupCode = getPlanGroupKey(plan.code);
    const current = groupedPlans.get(groupCode);
    if (!current) {
      groupedPlans.set(groupCode, {
        groupCode,
        title: plan.title,
        description: plan.description,
        tier: plan.tier,
        limitType: plan.limitType,
        deviceLimit: plan.deviceLimit,
        trafficLimitGb: plan.trafficLimitGb,
        internalSquadUuid: plan.internalSquadUuid,
        externalSquadUuid: plan.externalSquadUuid,
        isActive: plan.isActive,
        options: [{ id: plan.id, code: plan.code, durationDays: plan.durationDays, priceRub: plan.priceRub, isActive: plan.isActive }]
      });
      continue;
    }

    current.options.push({ id: plan.id, code: plan.code, durationDays: plan.durationDays, priceRub: plan.priceRub, isActive: plan.isActive });
    current.isActive = current.isActive || plan.isActive;
  }

  const planGroups = Array.from(groupedPlans.values()).map((group) => ({
    ...group,
    options: group.options.sort((a, b) => a.durationDays - b.durationDays)
  }));

  let internalSquads: Array<{ uuid: string; name: string }> = [];
  let externalSquads: Array<{ uuid: string; name: string }> = [];
  let squadsLoadError: string | null = null;

  try {
    const squads = await listRemnawaveSquads();
    internalSquads = squads.internalSquads;
    externalSquads = squads.externalSquads;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось загрузить сквады";
    squadsLoadError = message;
  }
  const referralSettings = await getOrCreateReferralSettings();

  return (
    <main className="container" style={{ padding: "36px 0 64px" }}>
      <h1 style={{ marginTop: 0 }}>Админ-панель</h1>
      <p>Только для OWNER.</p>

      <div className="panel-layout" style={{ marginTop: 24 }}>
        <aside className="panel-sidebar">
          <p className="panel-sidebar-title">Разделы</p>
          <nav className="panel-nav" aria-label="Навигация админки">
            <Link href={adminTabHref("users")} className={`panel-nav-link ${activeTab === "users" ? "is-active" : ""}`}>
              Пользователи и синхронизация
            </Link>
            <Link href={adminTabHref("plans")} className={`panel-nav-link ${activeTab === "plans" ? "is-active" : ""}`}>
              Планы
            </Link>
            <Link href={adminTabHref("promocodes")} className={`panel-nav-link ${activeTab === "promocodes" ? "is-active" : ""}`}>
              Промокоды
            </Link>
            <Link href={adminTabHref("referrals")} className={`panel-nav-link ${activeTab === "referrals" ? "is-active" : ""}`}>
              Рефералка
            </Link>
          </nav>
        </aside>

        <section className="panel-content">
          <nav className="panel-mobile-tabs" aria-label="Навигация админки (мобильная)">
            <Link href={adminTabHref("users")} className={`panel-nav-link ${activeTab === "users" ? "is-active" : ""}`}>
              Пользователи
            </Link>
            <Link href={adminTabHref("plans")} className={`panel-nav-link ${activeTab === "plans" ? "is-active" : ""}`}>
              Планы
            </Link>
            <Link href={adminTabHref("promocodes")} className={`panel-nav-link ${activeTab === "promocodes" ? "is-active" : ""}`}>
              Промокоды
            </Link>
            <Link href={adminTabHref("referrals")} className={`panel-nav-link ${activeTab === "referrals" ? "is-active" : ""}`}>
              Рефералка
            </Link>
          </nav>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 16 }}>
            <article style={cardStyle}>
              <p style={{ margin: "0 0 6px", color: "#64748b" }}>Пользователи</p>
              <strong style={{ fontSize: 28 }}>{usersCount}</strong>
            </article>
            <article style={cardStyle}>
              <p style={{ margin: "0 0 6px", color: "#64748b" }}>Платежи</p>
              <strong style={{ fontSize: 28 }}>{paymentsCount}</strong>
            </article>
            <article style={cardStyle}>
              <p style={{ margin: "0 0 6px", color: "#64748b" }}>Активные подписки</p>
              <strong style={{ fontSize: 28 }}>{activeSubscriptions}</strong>
            </article>
          </div>

          {activeTab === "users" ? (
            <>
              <h2 style={{ marginTop: 0 }}>Remnawave</h2>
              <article style={cardStyle}>
                <p style={{ margin: "0 0 10px", color: "#475569" }}>
                  Массовая синхронизация активных подписок с Remnawave (профиль, срок, лимит устройств, internal/external squad).
                </p>
                <form action={syncRemnawaveUsersAction}>
                  <button type="submit" style={smallButtonStyle}>
                    Синхронизировать пользователей
                  </button>
                </form>
              </article>

              <h2 style={{ marginTop: 30 }}>Пользователи и роли</h2>
              <div style={{ display: "grid", gap: 8 }}>
                {users.map((user) => (
                  <article key={user.id} style={cardStyle}>
                    <p style={{ margin: "0 0 6px", fontWeight: 600 }}>{user.email}</p>
                    <p style={{ margin: "0 0 8px", color: "#475569" }}>
                      Текущая роль: <strong>{user.role}</strong>
                    </p>
                    <p style={{ margin: "0 0 10px", color: "#64748b", fontSize: 13 }}>Создан: {new Date(user.createdAt).toLocaleString("ru-RU")}</p>

                    {role === "OWNER" ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <form action={updateUserRoleAction}>
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="nextRole" value="CUSTOMER" />
                          <button type="submit" style={smallButtonStyle}>
                            Сделать CUSTOMER
                          </button>
                        </form>
                        <form action={updateUserRoleAction}>
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="nextRole" value="ADMIN" />
                          <button type="submit" style={smallButtonStyle}>
                            Сделать ADMIN
                          </button>
                        </form>
                        <form action={updateUserRoleAction}>
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="nextRole" value="OWNER" />
                          <button type="submit" style={smallButtonStyle}>
                            Сделать OWNER
                          </button>
                        </form>
                      </div>
                    ) : (
                      <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Менять роли может только OWNER.</p>
                    )}
                  </article>
                ))}
              </div>
            </>
          ) : null}

          {activeTab === "plans" ? (
            <>
              <h2 style={{ marginTop: 0 }}>Тарифы и подписки</h2>
              {squadsLoadError ? (
                <p style={{ color: "#b91c1c", marginTop: 0 }}>
                  Не удалось получить сквады из Remnawave: {squadsLoadError}. Можно временно вписать UUID вручную.
                </p>
              ) : null}

              <article style={cardStyle}>
                <h3 style={{ marginTop: 0 }}>Добавить/обновить тариф (одна карточка, много сроков)</h3>
                <PlanGroupForm
                  action={upsertPlanGroupAction}
                  submitLabel="Сохранить тариф"
                  internalSquads={internalSquads}
                  externalSquads={externalSquads}
                />
              </article>

              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                {planGroups.map((group) => (
                  <article key={group.groupCode} style={cardStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700 }}>{group.title}</p>
                        <p style={{ margin: "4px 0 0", color: "#475569", fontSize: 13 }}>
                          Код группы: {group.groupCode} | Tier: {formatPlanTier(group.tier)} | Тип: {formatPlanLimitType(group.limitType)}
                        </p>
                        <p style={{ margin: "4px 0 0", color: "#475569", fontSize: 13 }}>
                          Варианты: {group.options.map((o) => `${formatDurationLabel(o.durationDays)} (${o.priceRub} ₽)`).join(", ")}
                        </p>
                      </div>
                      <form action={togglePlanGroupActiveAction}>
                        <input type="hidden" name="planIds" value={group.options.map((option) => option.id).join(",")} />
                        <input type="hidden" name="nextIsActive" value={String(!group.isActive)} />
                        <button type="submit" style={smallButtonStyle}>
                          {group.isActive ? "Отключить группу" : "Включить группу"}
                        </button>
                      </form>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <PlanGroupForm
                        action={upsertPlanGroupAction}
                        formId={`group-form-${group.groupCode}`}
                        initial={{
                          groupCode: group.groupCode,
                          title: group.title,
                          description: group.description,
                          tier: group.tier,
                          limitType: group.limitType,
                          deviceLimit: group.deviceLimit,
                          trafficLimitGb: group.trafficLimitGb,
                          internalSquadUuid: group.internalSquadUuid,
                          externalSquadUuid: group.externalSquadUuid,
                          isActive: group.isActive,
                          durationPrices: toDurationPricesText(group.options),
                          planIds: group.options.map((option) => option.id).join(","),
                        }}
                        internalSquads={internalSquads}
                        externalSquads={externalSquads}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button type="submit" form={`group-form-${group.groupCode}`} style={smallButtonStyle}>
                          Обновить тариф
                        </button>
                        <button
                          type="submit"
                          form={`group-form-${group.groupCode}`}
                          formAction={deletePlanGroupAction}
                          style={{ ...smallButtonStyle, borderColor: "#ef4444", color: "#b91c1c" }}
                        >
                          Удалить тариф навсегда
                        </button>
                      </div>
                      <p style={{ margin: "8px 0 0", fontSize: 12, color: "#b91c1c" }}>
                        Удаление безвозвратное только для шопа: варианты тарифа удаляются, подписки сохраняются (без привязки к плану).
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}

          {activeTab === "promocodes" ? (
            <>
              <h2 style={{ marginTop: 0 }}>Генератор промокодов</h2>
              <article style={cardStyle}>
                <form action={generatePromoCodesAction} style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
                    <label style={labelStyle}>
                      Количество
                      <input name="quantity" type="number" min={1} max={100} defaultValue={1} required style={inputStyle} />
                    </label>
                    <label style={labelStyle}>
                      Префикс
                      <input name="prefix" placeholder="VPN" defaultValue="VPN" style={inputStyle} />
                    </label>
                    <label style={labelStyle}>
                      Длина кода
                      <input name="codeLength" type="number" min={4} max={24} defaultValue={8} required style={inputStyle} />
                    </label>
                    <label style={labelStyle}>
                      Тип скидки
                      <select name="discountType" defaultValue="PERCENT" style={inputStyle}>
                        <option value="PERCENT">Проценты</option>
                        <option value="RUB">Рубли</option>
                      </select>
                    </label>
                    <label style={labelStyle}>
                      Значение скидки
                      <input name="discountValue" type="number" min={1} step={1} defaultValue={10} required style={inputStyle} />
                    </label>
                    <label style={labelStyle}>
                      Макс. активаций
                      <input name="maxActivations" type="number" min={1} step={1} defaultValue={1} required style={inputStyle} />
                    </label>
                    <label style={labelStyle}>
                      Срок действия до
                      <input
                        name="validUntil"
                        type="datetime-local"
                        defaultValue={new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 16)}
                        required
                        style={inputStyle}
                      />
                    </label>
                  </div>

                  <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <input name="oneTime" type="checkbox" defaultChecked />
                    Одноразовый (maxActivations = 1)
                  </label>
                  <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <input name="isActive" type="checkbox" defaultChecked />
                    Сразу активировать
                  </label>

                  <button type="submit" style={smallButtonStyle}>
                    Сгенерировать промокоды
                  </button>
                </form>
              </article>

              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {promoCodes.map((promo) => (
                  <article key={promo.id} style={cardStyle}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{promo.code}</p>
                    <p style={{ margin: "4px 0 0", fontSize: 13, color: "#475569" }}>
                      Скидка: {formatPromoDiscount(promo.discountPercent, promo.discountRub)} | Активаций: {promo.activationsCount}/{promo.maxActivations} |
                      {" До: "}
                      {new Date(promo.validUntil).toLocaleString("ru-RU")} | Статус: {promo.isActive ? "ACTIVE" : "DISABLED"}
                    </p>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>Создал: {promo.createdBy.email}</p>
                  </article>
                ))}
              </div>
            </>
          ) : null}

          {activeTab === "referrals" ? (
            <>
              <h2 style={{ marginTop: 0 }}>Управление реферальной системой</h2>
              <article style={cardStyle}>
                <form action={updateReferralSettingsAction} style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
                    <label style={labelStyle}>
                      Награда приглашающему (дни)
                      <input
                        name="inviterBonusDays"
                        type="number"
                        min={1}
                        step={1}
                        defaultValue={referralSettings.inviterBonusDays}
                        required
                        style={inputStyle}
                      />
                    </label>
                    <label style={labelStyle}>
                      Награда приглашенному (дни)
                      <input
                        name="invitedBonusDays"
                        type="number"
                        min={1}
                        step={1}
                        defaultValue={referralSettings.invitedBonusDays}
                        required
                        style={inputStyle}
                      />
                    </label>
                  </div>

                  <button type="submit" style={smallButtonStyle}>
                    Сохранить награды
                  </button>
                </form>
              </article>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function PlanGroupForm({
  action,
  submitLabel,
  formId,
  initial,
  internalSquads,
  externalSquads
}: {
  action: (formData: FormData) => Promise<void>;
  submitLabel?: string;
  formId?: string;
  initial?: {
    groupCode: string;
    title: string;
    description: string | null;
    tier: PlanTier;
    limitType: PlanLimitType;
    deviceLimit: number;
    trafficLimitGb: number | null;
    internalSquadUuid: string | null;
    externalSquadUuid: string | null;
    isActive: boolean;
    durationPrices: string;
    planIds?: string;
  };
  internalSquads: Array<{ uuid: string; name: string }>;
  externalSquads: Array<{ uuid: string; name: string }>;
}) {
  return (
    <form id={formId} action={action} style={{ display: "grid", gap: 8 }}>
      {initial?.planIds ? <input type="hidden" name="planIds" value={initial.planIds} /> : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
        <label style={labelStyle}>
          Код группы
          <input name="groupCode" defaultValue={initial?.groupCode ?? ""} required style={inputStyle} placeholder="simple" />
        </label>

        <label style={labelStyle}>
          Название
          <input name="title" defaultValue={initial?.title ?? ""} required style={inputStyle} />
        </label>

        <label style={labelStyle}>
          Tier
          <select name="tier" defaultValue={initial?.tier ?? "CUSTOM"} style={inputStyle}>
            {PLAN_TIER_OPTIONS.map((tier) => (
              <option key={tier} value={tier}>
                {tier}
              </option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          Тип лимита
          <select name="limitType" defaultValue={initial?.limitType ?? "DEVICES"} style={inputStyle}>
            {PLAN_LIMIT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          Кол-во устройств
          <input name="deviceLimit" type="number" min={1} step={1} defaultValue={initial?.deviceLimit ?? 1} required style={inputStyle} />
        </label>

        <label style={labelStyle}>
          Кол-во трафика (ГБ)
          <input name="trafficLimitGb" type="number" min={1} step={1} defaultValue={initial?.trafficLimitGb ?? ""} style={inputStyle} />
        </label>

        <label style={labelStyle}>
          Internal Squad
          <select name="internalSquadUuid" defaultValue={initial?.internalSquadUuid ?? ""} style={inputStyle}>
            <option value="">Не выбрано</option>
            {initial?.internalSquadUuid && !internalSquads.some((squad) => squad.uuid === initial.internalSquadUuid) ? (
              <option value={initial.internalSquadUuid}>{`Текущий (вне списка): ${initial.internalSquadUuid}`}</option>
            ) : null}
            {internalSquads.map((squad) => (
              <option key={squad.uuid} value={squad.uuid}>
                {squad.name}
              </option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          External Squad
          <select name="externalSquadUuid" defaultValue={initial?.externalSquadUuid ?? ""} style={inputStyle}>
            <option value="">Не выбрано</option>
            {initial?.externalSquadUuid && !externalSquads.some((squad) => squad.uuid === initial.externalSquadUuid) ? (
              <option value={initial.externalSquadUuid}>{`Текущий (вне списка): ${initial.externalSquadUuid}`}</option>
            ) : null}
            {externalSquads.map((squad) => (
              <option key={squad.uuid} value={squad.uuid}>
                {squad.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label style={labelStyle}>
        Описание
        <textarea name="description" defaultValue={initial?.description ?? ""} rows={2} style={inputStyle} />
      </label>

      <label style={labelStyle}>
        Сроки и цены (формат: дни:цена, каждая строка отдельно)
        <textarea
          name="durationPrices"
          defaultValue={initial?.durationPrices ?? "30:80\n90:220\n180:400\n365:720"}
          rows={5}
          required
          style={inputStyle}
        />
      </label>

      <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input name="isActive" type="checkbox" defaultChecked={initial?.isActive ?? true} />
        Активен
      </label>

      {submitLabel ? (
        <button type="submit" style={smallButtonStyle}>
          {submitLabel}
        </button>
      ) : null}
    </form>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 12,
  background: "#fff"
};

const smallButtonStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  background: "#fff",
  padding: "6px 10px",
  cursor: "pointer"
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 13,
  color: "#334155"
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "8px 10px",
  background: "#fff"
};
