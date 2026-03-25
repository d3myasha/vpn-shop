import { PrismaClient, PlanTier } from "@prisma/client";

const prisma = new PrismaClient();

type SeedPlan = {
  code: string;
  tier: PlanTier;
  title: string;
  durationDays: number;
  deviceLimit: number;
  priceRub: number;
};

const plans: SeedPlan[] = [
  { code: "simple_1m", tier: PlanTier.SIMPLE, title: "Простая 1 месяц", durationDays: 30, deviceLimit: 1, priceRub: 80 },
  { code: "simple_3m", tier: PlanTier.SIMPLE, title: "Простая 3 месяца", durationDays: 90, deviceLimit: 1, priceRub: 220 },
  { code: "simple_6m", tier: PlanTier.SIMPLE, title: "Простая 6 месяцев", durationDays: 180, deviceLimit: 1, priceRub: 400 },
  { code: "simple_12m", tier: PlanTier.SIMPLE, title: "Простая 1 год", durationDays: 365, deviceLimit: 1, priceRub: 720 },
  { code: "extended_1m", tier: PlanTier.EXTENDED, title: "Расширенная 1 месяц", durationDays: 30, deviceLimit: 3, priceRub: 100 },
  { code: "extended_3m", tier: PlanTier.EXTENDED, title: "Расширенная 3 месяца", durationDays: 90, deviceLimit: 3, priceRub: 280 },
  { code: "extended_6m", tier: PlanTier.EXTENDED, title: "Расширенная 6 месяцев", durationDays: 180, deviceLimit: 3, priceRub: 540 },
  { code: "extended_12m", tier: PlanTier.EXTENDED, title: "Расширенная 1 год", durationDays: 365, deviceLimit: 3, priceRub: 960 },
  { code: "super_1m", tier: PlanTier.SUPER, title: "Супер 1 месяц", durationDays: 30, deviceLimit: 5, priceRub: 120 },
  { code: "super_3m", tier: PlanTier.SUPER, title: "Супер 3 месяца", durationDays: 90, deviceLimit: 5, priceRub: 330 },
  { code: "super_6m", tier: PlanTier.SUPER, title: "Супер 6 месяцев", durationDays: 180, deviceLimit: 5, priceRub: 630 },
  { code: "super_12m", tier: PlanTier.SUPER, title: "Супер 1 год", durationDays: 365, deviceLimit: 5, priceRub: 1080 }
];

async function main() {
  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      create: plan,
      update: {
        title: plan.title,
        durationDays: plan.durationDays,
        deviceLimit: plan.deviceLimit,
        priceRub: plan.priceRub,
        isActive: true
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
