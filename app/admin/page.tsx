import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listRemnawaveSquads } from "@/lib/remnawave";
import { PlanLimitType, PlanTier, UserRole } from "@prisma/client";

const ROLE_OPTIONS: UserRole[] = ["CUSTOMER", "ADMIN", "OWNER"];
const PLAN_TIER_OPTIONS: PlanTier[] = ["SIMPLE", "EXTENDED", "SUPER", "CUSTOM"];
const PLAN_LIMIT_OPTIONS: PlanLimitType[] = ["DEVICES", "TRAFFIC"];

type ParsedPlanForm = {
  id?: string;
  code: string;
  title: string;
  description: string | null;
  tier: PlanTier;
  limitType: PlanLimitType;
  durationDays: number;
  deviceLimit: number;
  trafficLimitGb: number | null;
  priceRub: number;
  internalSquadUuid: string | null;
  externalSquadUuid: string | null;
  isActive: boolean;
};

function parsePlanForm(formData: FormData): ParsedPlanForm {
  const id = String(formData.get("planId") ?? "").trim();
  const code = String(formData.get("code") ?? "")
    .trim()
    .toLowerCase();
  const title = String(formData.get("title") ?? "").trim();
  const descriptionRaw = String(formData.get("description") ?? "").trim();
  const tier = String(formData.get("tier") ?? "") as PlanTier;
  const limitType = String(formData.get("limitType") ?? "") as PlanLimitType;

  const durationDays = Number(formData.get("durationDays"));
  const deviceLimit = Number(formData.get("deviceLimit"));
  const trafficLimitGb = Number(formData.get("trafficLimitGb"));
  const priceRub = Number(formData.get("priceRub"));

  const internalSquadUuidRaw = String(formData.get("internalSquadUuid") ?? "").trim();
  const externalSquadUuidRaw = String(formData.get("externalSquadUuid") ?? "").trim();

  if (!code || !/^[a-z0-9_-]{3,64}$/.test(code)) {
    throw new Error("Код плана должен быть 3-64 символа: a-z, 0-9, _ или -.");
  }
  if (!title) {
    throw new Error("Название плана обязательно.");
  }
  if (!PLAN_TIER_OPTIONS.includes(tier)) {
    throw new Error("Некорректный tier.");
  }
  if (!PLAN_LIMIT_OPTIONS.includes(limitType)) {
    throw new Error("Некорректный тип лимита.");
  }
  if (!Number.isInteger(durationDays) || durationDays <= 0) {
    throw new Error("Длительность должна быть целым числом больше 0.");
  }
  if (!Number.isInteger(priceRub) || priceRub <= 0) {
    throw new Error("Цена должна быть целым числом больше 0.");
  }

  if (!Number.isInteger(deviceLimit) || deviceLimit <= 0) {
    throw new Error("Лимит устройств должен быть целым числом больше 0.");
  }

  let normalizedTrafficLimitGb: number | null = null;
  if (limitType === "TRAFFIC") {
    if (!Number.isInteger(trafficLimitGb) || trafficLimitGb <= 0) {
      throw new Error("Для типа TRAFFIC нужно указать лимит трафика в ГБ (целое число > 0).");
    }
    normalizedTrafficLimitGb = trafficLimitGb;
  }

  return {
    id: id || undefined,
    code,
    title,
    description: descriptionRaw || null,
    tier,
    limitType,
    durationDays,
    deviceLimit,
    trafficLimitGb: normalizedTrafficLimitGb,
    priceRub,
    internalSquadUuid: internalSquadUuidRaw || null,
    externalSquadUuid: externalSquadUuidRaw || null,
    isActive: String(formData.get("isActive") ?? "").toLowerCase() === "on"
  };
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

export default async function AdminPage() {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user || (role !== "OWNER" && role !== "ADMIN")) {
    redirect("/account");
  }

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
      select: { id: true, role: true, email: true }
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

    await prisma.user.update({
      where: { id: target.id },
      data: { role: nextRole }
    });

    revalidatePath("/admin");
  }

  async function upsertPlanAction(formData: FormData) {
    "use server";

    const actor = await auth();
    if (!actor?.user || (actor.user.role !== "OWNER" && actor.user.role !== "ADMIN")) {
      throw new Error("Нет прав для управления тарифами.");
    }

    const parsed = parsePlanForm(formData);

    if (parsed.id) {
      await prisma.plan.update({
        where: { id: parsed.id },
        data: {
          code: parsed.code,
          title: parsed.title,
          description: parsed.description,
          tier: parsed.tier,
          limitType: parsed.limitType,
          durationDays: parsed.durationDays,
          deviceLimit: parsed.deviceLimit,
          trafficLimitGb: parsed.trafficLimitGb,
          priceRub: parsed.priceRub,
          internalSquadUuid: parsed.internalSquadUuid,
          externalSquadUuid: parsed.externalSquadUuid,
          isActive: parsed.isActive
        }
      });
    } else {
      await prisma.plan.create({
        data: {
          code: parsed.code,
          title: parsed.title,
          description: parsed.description,
          tier: parsed.tier,
          limitType: parsed.limitType,
          durationDays: parsed.durationDays,
          deviceLimit: parsed.deviceLimit,
          trafficLimitGb: parsed.trafficLimitGb,
          priceRub: parsed.priceRub,
          internalSquadUuid: parsed.internalSquadUuid,
          externalSquadUuid: parsed.externalSquadUuid,
          isActive: parsed.isActive
        }
      });
    }

    revalidatePath("/admin");
    revalidatePath("/");
  }

  async function togglePlanActiveAction(formData: FormData) {
    "use server";

    const actor = await auth();
    if (!actor?.user || (actor.user.role !== "OWNER" && actor.user.role !== "ADMIN")) {
      throw new Error("Нет прав для управления тарифами.");
    }

    const planId = String(formData.get("planId") ?? "").trim();
    if (!planId) {
      throw new Error("Не передан planId.");
    }

    const current = await prisma.plan.findUnique({ where: { id: planId }, select: { id: true, isActive: true } });
    if (!current) {
      throw new Error("План не найден.");
    }

    await prisma.plan.update({
      where: { id: current.id },
      data: { isActive: !current.isActive }
    });

    revalidatePath("/admin");
    revalidatePath("/");
  }

  const [usersCount, paymentsCount, activeSubscriptions, users, plans] = await Promise.all([
    prisma.user.count(),
    prisma.payment.count(),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, role: true, createdAt: true }
    }),
    prisma.plan.findMany({ orderBy: [{ title: "asc" }, { durationDays: "asc" }] })
  ]);

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

  return (
    <main className="container" style={{ padding: "36px 0 64px" }}>
      <h1 style={{ marginTop: 0 }}>Админ-панель</h1>
      <p>Только для OWNER/ADMIN.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
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

      <h2 style={{ marginTop: 26 }}>Тарифы и подписки</h2>
      {squadsLoadError ? (
        <p style={{ color: "#b91c1c", marginTop: 0 }}>
          Не удалось получить сквады из Remnawave: {squadsLoadError}. Можно временно вписать UUID вручную.
        </p>
      ) : null}

      <article style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Добавить тариф</h3>
        <PlanForm
          action={upsertPlanAction}
          submitLabel="Создать тариф"
          internalSquads={internalSquads}
          externalSquads={externalSquads}
        />
      </article>

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {plans.map((plan) => (
          <article key={plan.id} style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div>
                <p style={{ margin: 0, fontWeight: 700 }}>{plan.title}</p>
                <p style={{ margin: "4px 0 0", color: "#475569", fontSize: 13 }}>
                  Код: {plan.code} | Tier: {formatPlanTier(plan.tier)} | Тип: {formatPlanLimitType(plan.limitType)} | {plan.durationDays} дн. | {plan.priceRub} ₽
                </p>
              </div>
              <form action={togglePlanActiveAction}>
                <input type="hidden" name="planId" value={plan.id} />
                <button type="submit" style={smallButtonStyle}>
                  {plan.isActive ? "Отключить" : "Включить"}
                </button>
              </form>
            </div>

            <div style={{ marginTop: 10 }}>
              <PlanForm
                action={upsertPlanAction}
                submitLabel="Сохранить"
                initial={plan}
                internalSquads={internalSquads}
                externalSquads={externalSquads}
              />
            </div>
          </article>
        ))}
      </div>

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
    </main>
  );
}

function PlanForm({
  action,
  submitLabel,
  initial,
  internalSquads,
  externalSquads
}: {
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
  initial?: {
    id: string;
    code: string;
    title: string;
    description: string | null;
    tier: PlanTier;
    limitType: PlanLimitType;
    durationDays: number;
    deviceLimit: number;
    trafficLimitGb: number | null;
    priceRub: number;
    internalSquadUuid: string | null;
    externalSquadUuid: string | null;
    isActive: boolean;
  };
  internalSquads: Array<{ uuid: string; name: string }>;
  externalSquads: Array<{ uuid: string; name: string }>;
}) {
  return (
    <form action={action} style={{ display: "grid", gap: 8 }}>
      {initial ? <input type="hidden" name="planId" value={initial.id} /> : null}

      <label style={labelStyle}>
        Код плана
        <input name="code" defaultValue={initial?.code ?? ""} required style={inputStyle} />
      </label>

      <label style={labelStyle}>
        Название
        <input name="title" defaultValue={initial?.title ?? ""} required style={inputStyle} />
      </label>

      <label style={labelStyle}>
        Описание
        <textarea name="description" defaultValue={initial?.description ?? ""} rows={2} style={inputStyle} />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
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
          Длительность (дни)
          <input name="durationDays" type="number" min={1} step={1} defaultValue={initial?.durationDays ?? 30} required style={inputStyle} />
        </label>

        <label style={labelStyle}>
          Цена (RUB)
          <input name="priceRub" type="number" min={1} step={1} defaultValue={initial?.priceRub ?? 100} required style={inputStyle} />
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
          <input
            name="internalSquadUuid"
            defaultValue={initial?.internalSquadUuid ?? ""}
            list="internal-squads-list"
            placeholder="UUID internal squad"
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          External Squad
          <input
            name="externalSquadUuid"
            defaultValue={initial?.externalSquadUuid ?? ""}
            list="external-squads-list"
            placeholder="UUID external squad"
            style={inputStyle}
          />
        </label>
      </div>

      <datalist id="internal-squads-list">
        {internalSquads.map((squad) => (
          <option key={squad.uuid} value={squad.uuid}>
            {squad.name}
          </option>
        ))}
      </datalist>
      <datalist id="external-squads-list">
        {externalSquads.map((squad) => (
          <option key={squad.uuid} value={squad.uuid}>
            {squad.name}
          </option>
        ))}
      </datalist>

      <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input name="isActive" type="checkbox" defaultChecked={initial?.isActive ?? true} />
        Активен
      </label>

      <button type="submit" style={smallButtonStyle}>
        {submitLabel}
      </button>
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
