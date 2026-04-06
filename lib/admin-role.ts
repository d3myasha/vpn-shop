import type { UserRole } from "@prisma/client";

type RoleIdentity = {
  email?: string | null;
  telegramId?: string | null;
};

const ROLE_PRIORITY: Record<UserRole, number> = {
  CUSTOMER: 1,
  ADMIN: 2,
  OWNER: 3,
};

function parseCsvSet(value: string | undefined, { lowerCase = false }: { lowerCase?: boolean } = {}) {
  if (!value) {
    return new Set<string>();
  }

  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (lowerCase ? item.toLowerCase() : item));

  return new Set(items);
}

function resolveRequestedRole(identity: RoleIdentity): UserRole | null {
  const email = identity.email?.trim().toLowerCase();
  const telegramId = identity.telegramId?.trim();

  const ownerEmails = parseCsvSet(process.env.OWNER_EMAILS, { lowerCase: true });
  const ownerTelegramIds = parseCsvSet(process.env.OWNER_TELEGRAM_IDS);
  const adminEmails = parseCsvSet(process.env.ADMIN_EMAILS, { lowerCase: true });
  const adminTelegramIds = parseCsvSet(process.env.ADMIN_TELEGRAM_IDS);

  if ((email && ownerEmails.has(email)) || (telegramId && ownerTelegramIds.has(telegramId))) {
    return "OWNER";
  }

  if ((email && adminEmails.has(email)) || (telegramId && adminTelegramIds.has(telegramId))) {
    return "ADMIN";
  }

  return null;
}

export function resolveRoleForNewUser(identity: RoleIdentity): UserRole {
  return resolveRequestedRole(identity) ?? "CUSTOMER";
}

export function resolvePromotedRole(currentRole: UserRole, identity: RoleIdentity): UserRole {
  const requested = resolveRequestedRole(identity);
  if (!requested) {
    return currentRole;
  }

  return ROLE_PRIORITY[requested] > ROLE_PRIORITY[currentRole] ? requested : currentRole;
}
