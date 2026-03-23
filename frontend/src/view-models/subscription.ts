import type { SubscriptionResponse } from '../api/client';
import { daysLeft } from '../utils/format';

export type SubscriptionViewState = 'none' | 'pending' | 'active' | 'expired';

export type SubscriptionViewModel = {
  state: SubscriptionViewState;
  badge: string;
  title: string;
  subtitle: string;
  ctaPrimary: string;
  ctaSecondary: string;
  progressLabel: string;
  daysLeft: number | null;
  planName: string | null;
  priceKopeks: number | null;
  endDate: string | null;
  connectionConfig: unknown;
};

export const emptySubscription: SubscriptionViewModel = {
  state: 'none',
  badge: 'Нет подписки',
  title: 'Подписка не активирована',
  subtitle: 'Выберите тариф, чтобы получить доступ к серверам и защищенному соединению.',
  ctaPrimary: 'Выбрать тариф',
  ctaSecondary: 'Как это работает',
  progressLabel: 'Нет активного лимита',
  daysLeft: null,
  planName: null,
  priceKopeks: null,
  endDate: null,
  connectionConfig: null
};

export const toSubscriptionViewModel = (subscription: SubscriptionResponse | null): SubscriptionViewModel => {
  if (!subscription) {
    return emptySubscription;
  }

  const remaining = daysLeft(subscription.endDate);
  const expiredByDate = remaining !== null && remaining < 0;
  const normalizedState: SubscriptionViewState =
    subscription.status === 'active' && !expiredByDate
      ? 'active'
      : subscription.status === 'pending'
        ? 'pending'
        : 'expired';

  if (normalizedState === 'pending') {
    return {
      state: 'pending',
      badge: 'Ожидает оплаты',
      title: `Тариф ${subscription.plan.name}`,
      subtitle: 'Мы ждём подтверждение платежа. Обычно это занимает до нескольких минут.',
      ctaPrimary: 'Проверить статус',
      ctaSecondary: 'Открыть тарифы',
      progressLabel: 'Активация после оплаты',
      daysLeft: remaining,
      planName: subscription.plan.name,
      priceKopeks: subscription.plan.priceKopeks,
      endDate: subscription.endDate,
      connectionConfig: subscription.connectionConfig ?? null
    };
  }

  if (normalizedState === 'active') {
    return {
      state: 'active',
      badge: 'Активна',
      title: `Подключен тариф ${subscription.plan.name}`,
      subtitle: 'Подписка работает корректно, защита включена.',
      ctaPrimary: 'Управление подпиской',
      ctaSecondary: 'Открыть тарифы',
      progressLabel: 'Дней до окончания',
      daysLeft: remaining,
      planName: subscription.plan.name,
      priceKopeks: subscription.plan.priceKopeks,
      endDate: subscription.endDate,
      connectionConfig: subscription.connectionConfig ?? null
    };
  }

  return {
    state: 'expired',
    badge: 'Истекла',
    title: `Тариф ${subscription.plan.name} завершен`,
    subtitle: 'Продлите подписку, чтобы вернуть полный доступ.',
    ctaPrimary: 'Продлить подписку',
    ctaSecondary: 'Сменить тариф',
    progressLabel: 'Подписка не активна',
    daysLeft: remaining,
    planName: subscription.plan.name,
    priceKopeks: subscription.plan.priceKopeks,
    endDate: subscription.endDate,
    connectionConfig: subscription.connectionConfig ?? null
  };
};
