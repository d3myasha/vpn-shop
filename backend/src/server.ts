import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { bootstrapAdminUser } from './utils/bootstrap.js';

const start = async () => {
  await prisma.$connect();
  await bootstrapAdminUser();
  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`d3MVpn Shop backend started on port ${env.PORT}`);
  });
};

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Server start error:', error);
  process.exit(1);
});
