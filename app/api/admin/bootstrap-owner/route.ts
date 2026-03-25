import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const bootstrapSchema = z.object({
  email: z.string().email(),
  token: z.string().min(8)
});

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as unknown;
    const parsed = bootstrapSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Неверный формат запроса" }, { status: 400 });
    }

    const expectedToken = process.env.OWNER_BOOTSTRAP_TOKEN;
    if (!expectedToken) {
      return NextResponse.json({ error: "OWNER_BOOTSTRAP_TOKEN не задан в окружении" }, { status: 503 });
    }

    if (parsed.data.token !== expectedToken) {
      return NextResponse.json({ error: "Неверный bootstrap token" }, { status: 401 });
    }

    const email = parsed.data.email.toLowerCase();
    const existingOwner = await prisma.user.findFirst({
      where: { role: "OWNER" },
      select: { id: true, email: true }
    });

    if (existingOwner && existingOwner.email !== email) {
      return NextResponse.json({ error: "OWNER уже назначен. Используйте админку для смены ролей." }, { status: 409 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true, email: true }
    });
    if (!user) {
      return NextResponse.json({ error: "Пользователь с таким email не найден" }, { status: 404 });
    }

    if (user.role !== "OWNER") {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: "OWNER" }
      });
    }

    return NextResponse.json({
      ok: true,
      email,
      role: "OWNER"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bootstrap error";
    logger.error("bootstrap_owner_failed", error, { route: "/api/admin/bootstrap-owner" });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
