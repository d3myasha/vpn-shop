import { Role } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { comparePassword, hashPassword } from './password.js';

export const bootstrapAdminUser = async (): Promise<void> => {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    // eslint-disable-next-line no-console
    console.warn('ADMIN_EMAIL/ADMIN_PASSWORD are not set. Admin bootstrap is skipped.');
    return;
  }

  const adminEmail = env.ADMIN_EMAIL.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    const updates: { role?: Role; passwordHash?: string } = {};

    if (existing.role !== Role.admin) {
      updates.role = Role.admin;
    }

    const hasExpectedPassword = await comparePassword(env.ADMIN_PASSWORD, existing.passwordHash);
    if (!hasExpectedPassword) {
      updates.passwordHash = await hashPassword(env.ADMIN_PASSWORD);
    }

    if (updates.role || updates.passwordHash) {
      await prisma.user.update({
        where: { id: existing.id },
        data: updates
      });
    }
    return;
  }

  await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash: await hashPassword(env.ADMIN_PASSWORD),
      role: Role.admin
    }
  });
};
