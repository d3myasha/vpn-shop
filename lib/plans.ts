export type PlanCard = {
  code: string;
  groupTitle: string;
  durationLabel: string;
  durationDays: number;
  deviceLimit: number;
  priceRub: number;
};

export const PLAN_CARDS: PlanCard[] = [
  { code: "simple_1m", groupTitle: "Простая подписка", durationLabel: "1 месяц", durationDays: 30, deviceLimit: 1, priceRub: 80 },
  { code: "simple_3m", groupTitle: "Простая подписка", durationLabel: "3 месяца", durationDays: 90, deviceLimit: 1, priceRub: 220 },
  { code: "simple_6m", groupTitle: "Простая подписка", durationLabel: "6 месяцев", durationDays: 180, deviceLimit: 1, priceRub: 400 },
  { code: "simple_12m", groupTitle: "Простая подписка", durationLabel: "1 год", durationDays: 365, deviceLimit: 1, priceRub: 720 },
  { code: "extended_1m", groupTitle: "Расширенная подписка", durationLabel: "1 месяц", durationDays: 30, deviceLimit: 3, priceRub: 100 },
  { code: "extended_3m", groupTitle: "Расширенная подписка", durationLabel: "3 месяца", durationDays: 90, deviceLimit: 3, priceRub: 280 },
  { code: "extended_6m", groupTitle: "Расширенная подписка", durationLabel: "6 месяцев", durationDays: 180, deviceLimit: 3, priceRub: 540 },
  { code: "extended_12m", groupTitle: "Расширенная подписка", durationLabel: "1 год", durationDays: 365, deviceLimit: 3, priceRub: 960 },
  { code: "super_1m", groupTitle: "Супер подписка", durationLabel: "1 месяц", durationDays: 30, deviceLimit: 5, priceRub: 120 },
  { code: "super_3m", groupTitle: "Супер подписка", durationLabel: "3 месяца", durationDays: 90, deviceLimit: 5, priceRub: 330 },
  { code: "super_6m", groupTitle: "Супер подписка", durationLabel: "6 месяцев", durationDays: 180, deviceLimit: 5, priceRub: 630 },
  { code: "super_12m", groupTitle: "Супер подписка", durationLabel: "1 год", durationDays: 365, deviceLimit: 5, priceRub: 1080 }
];
