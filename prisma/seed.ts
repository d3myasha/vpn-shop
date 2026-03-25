import { PlanLimitType, PrismaClient, PlanTier } from "@prisma/client";

const prisma = new PrismaClient();

type SeedPlan = {
  code: string;
  tier: PlanTier;
  title: string;
  description?: string;
  limitType: PlanLimitType;
  durationDays: number;
  deviceLimit: number;
  trafficLimitGb?: number | null;
  priceRub: number;
  internalSquadUuid?: string | null;
  externalSquadUuid?: string | null;
};

const plans: SeedPlan[] = [
  { code: "simple_1m", tier: PlanTier.SIMPLE, title: "Простая подписка", description: "Лимит трафика: нет", limitType: PlanLimitType.DEVICES, durationDays: 30, deviceLimit: 1, trafficLimitGb: null, priceRub: 80 },
  { code: "simple_3m", tier: PlanTier.SIMPLE, title: "Простая подписка", description: "Лимит трафика: нет", limitType: PlanLimitType.DEVICES, durationDays: 90, deviceLimit: 1, trafficLimitGb: null, priceRub: 220 },
  { code: "simple_6m", tier: PlanTier.SIMPLE, title: "Простая подписка", description: "Лимит трафика: нет", limitType: PlanLimitType.DEVICES, durationDays: 180, deviceLimit: 1, trafficLimitGb: null, priceRub: 400 },
  { code: "simple_12m", tier: PlanTier.SIMPLE, title: "Простая подписка", description: "Лимит трафика: нет", limitType: PlanLimitType.DEVICES, durationDays: 365, deviceLimit: 1, trafficLimitGb: null, priceRub: 720 },
  { code: "extended_1m", tier: PlanTier.EXTENDED, title: "Расширенная подписка", description: "Лимит трафика: нет", limitType: PlanLimitType.DEVICES, durationDays: 30, deviceLimit: 3, trafficLimitGb: null, priceRub: 100 },
  { code: "extended_3m", tier: PlanTier.EXTENDED, title: "Расширенная подписка", description: "Лимит трафика: нет", limitType: PlanLimitType.DEVICES, durationDays: 90, deviceLimit: 3, trafficLimitGb: null, priceRub: 280 },
  { code: "extended_6m", tier: PlanTier.EXTENDED, title: "Расширенная подписка", description: "Лимит трафика: нет", limitType: PlanLimitType.DEVICES, durationDays: 180, deviceLimit: 3, trafficLimitGb: null, priceRub: 540 },
  { code: "extended_12m", tier: PlanTier.EXTENDED, title: "Расширенная подписка", description: "Лимит трафика: нет", limitType: PlanLimitType.DEVICES, durationDays: 365, deviceLimit: 3, trafficLimitGb: null, priceRub: 960 },
  { code: "super_1m", tier: PlanTier.SUPER, title: "Супер подписка", description: "Лимит трафика: нет", limitType: PlanLimitType.DEVICES, durationDays: 30, deviceLimit: 5, trafficLimitGb: null, priceRub: 120 },
  { code: "super_3m", tier: PlanTier.SUPER, title: "Супер подписка", description: "Лимит трафика: нет", limitType: PlanLimitType.DEVICES, durationDays: 90, deviceLimit: 5, trafficLimitGb: null, priceRub: 330 },
  { code: "super_6m", tier: PlanTier.SUPER, title: "Супер подписка", description: "Лимит трафика: нет", limitType: PlanLimitType.DEVICES, durationDays: 180, deviceLimit: 5, trafficLimitGb: null, priceRub: 630 },
  { code: "super_12m", tier: PlanTier.SUPER, title: "Супер подписка", description: "Лимит трафика: нет", limitType: PlanLimitType.DEVICES, durationDays: 365, deviceLimit: 5, trafficLimitGb: null, priceRub: 1080 }
];

async function main() {
  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      create: plan,
      update: {
        title: plan.title,
        description: plan.description ?? null,
        limitType: plan.limitType,
        durationDays: plan.durationDays,
        deviceLimit: plan.deviceLimit,
        trafficLimitGb: plan.trafficLimitGb ?? null,
        priceRub: plan.priceRub,
        internalSquadUuid: plan.internalSquadUuid ?? null,
        externalSquadUuid: plan.externalSquadUuid ?? null,
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
