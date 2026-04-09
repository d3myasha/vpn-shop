import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { upsertTelegramUser, type TelegramAuthPayload } from "@/lib/telegram-auth";
import { resolvePromotedRole } from "@/lib/admin-role";
import { logger } from "@/lib/logger";

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const telegramSignInSchema = z.object({
  id: z.coerce.string().min(1),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.coerce.string().min(1),
  hash: z.coerce.string().min(1),
});

const VALID_ROLES = ["OWNER", "ADMIN", "CUSTOMER"] as const;
type ValidRole = typeof VALID_ROLES[number];

function validateRole(role: unknown): ValidRole {
  if (typeof role === "string" && VALID_ROLES.includes(role as ValidRole)) {
    return role as ValidRole;
  }
  return "CUSTOMER";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  providers: [
    Credentials({
      id: "telegram",
      name: "Telegram",
      credentials: {
        id: { label: "id", type: "text" },
        first_name: { label: "first_name", type: "text" },
        last_name: { label: "last_name", type: "text" },
        username: { label: "username", type: "text" },
        photo_url: { label: "photo_url", type: "text" },
        auth_date: { label: "auth_date", type: "text" },
        hash: { label: "hash", type: "text" }
      },
      async authorize(credentials) {
        const parsed = telegramSignInSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        try {
          const user = await upsertTelegramUser(parsed.data as TelegramAuthPayload);
          const identity = await prisma.botIdentity.findUnique({
            where: { userId: user.id },
            select: { botUserId: true },
          });

          return {
            id: user.id,
            email: user.email,
            role: validateRole(user.role),
            botUserId: identity?.botUserId ?? undefined,
          };
        } catch (error) {
          logger.error("telegram_auth_authorize_failed", error, { provider: "telegram" });
          return null;
        }
      }
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Пароль", type: "password" }
      },
      async authorize(credentials) {
        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() }
        });

        if (!user) {
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          return null;
        }

        const promotedRole = resolvePromotedRole(user.role, { email: user.email });
        if (promotedRole !== user.role) {
          await prisma.user.update({
            where: { id: user.id },
            data: { role: promotedRole },
          });
          user.role = promotedRole;
        }

        return {
          id: user.id,
          email: user.email,
          role: validateRole(user.role),
        };
      }
    })
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login"
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = validateRole(user.role);
        token.botUserId = typeof user.botUserId === "string" ? user.botUserId : token.botUserId;
      }

      if (token.id && !token.botUserId) {
        try {
          const identity = await prisma.botIdentity.findUnique({
            where: { userId: String(token.id) },
            select: { botUserId: true },
          });
          if (identity?.botUserId) {
            token.botUserId = identity.botUserId;
          }
        } catch (error) {
          // Не критичная ошибка — botUserId можно получить позже
          logger.warn("jwt_bot_identity_fetch_failed", { userId: token.id, error: error instanceof Error ? error.message : String(error) });
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id);
        session.user.role = validateRole(token.role);
        if (token.botUserId) {
          session.user.botUserId = String(token.botUserId);
        }
      }
      return session;
    }
  }
});
