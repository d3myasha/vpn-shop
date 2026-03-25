import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";

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
    if (!userId || !["OWNER", "ADMIN", "CUSTOMER"].includes(nextRole)) {
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

  const [usersCount, paymentsCount, activeSubscriptions, users] = await Promise.all([
    prisma.user.count(),
    prisma.payment.count(),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, role: true, createdAt: true }
    })
  ]);

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

      <h2 style={{ marginTop: 26 }}>Пользователи и роли</h2>
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
