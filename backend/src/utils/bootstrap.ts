import { Role } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { hashPassword } from './password.js';

export const bootstrapAdminUser = async (): Promise<void> => {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email: env.ADMIN_EMAIL } });
  if (existing) {
    if (existing.role !== Role.admin) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: Role.admin }
      });
    }
    return;
  }

  await prisma.user.create({
    data: {
      email: env.ADMIN_EMAIL,
      passwordHash: await hashPassword(env.ADMIN_PASSWORD),
      role: Role.admin
    }
  });
};
