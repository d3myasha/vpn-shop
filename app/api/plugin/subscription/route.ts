import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveOrCreateBotIdentityForUser } from "@/lib/bot-identity";
import { getBotSubscriptionByUserId, isRemnashopConfigured, RemnashopAdapterError } from "@/lib/remnashop-adapter";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isRemnashopConfigured()) {
    return NextResponse.json({ error: "Bot backend integration is not configured" }, { status: 503 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const identity = await resolveOrCreateBotIdentityForUser({
    userId: user.id,
    email: user.email,
  });

  if (!identity?.botUserId) {
    return NextResponse.json({ error: "Bot identity is not linked for current user" }, { status: 404 });
  }

  try {
    const subscription = await getBotSubscriptionByUserId(identity.botUserId);
    return NextResponse.json({ subscription });
  } catch (error) {
    if (error instanceof RemnashopAdapterError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Failed to load subscription from bot backend" }, { status: 502 });
  }
}
