import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const plans = [
    {
      name: '1 месяц',
      description: 'Базовый план для личного использования',
      priceKopeks: 29900,
      durationDays: 30,
      trafficLimitGb: 100,
      remnawaveTemplateUuid: '11111111-1111-1111-1111-111111111111',
      sortOrder: 1,
      isActive: true
    },
    {
      name: '3 месяца',
      description: 'Оптимальный план по цене и сроку',
      priceKopeks: 79900,
      durationDays: 90,
      trafficLimitGb: 350,
      remnawaveTemplateUuid: '22222222-2222-2222-2222-222222222222',
      sortOrder: 2,
      isActive: true
    },
    {
      name: 'Год',
      description: 'Максимальная выгода для постоянного использования',
      priceKopeks: 249900,
      durationDays: 365,
      trafficLimitGb: 1500,
      remnawaveTemplateUuid: '33333333-3333-3333-3333-333333333333',
      sortOrder: 3,
      isActive: true
    }
  ];

  for (const plan of plans) {
    const existing = await prisma.subscriptionPlan.findFirst({
      where: { name: plan.name }
    });

    if (!existing) {
      await prisma.subscriptionPlan.create({ data: plan });
      continue;
    }

    await prisma.subscriptionPlan.update({
      where: { id: existing.id },
      data: {
        description: plan.description,
        priceKopeks: plan.priceKopeks,
        durationDays: plan.durationDays,
        trafficLimitGb: plan.trafficLimitGb,
        remnawaveTemplateUuid: plan.remnawaveTemplateUuid,
        sortOrder: plan.sortOrder,
        isActive: plan.isActive
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
