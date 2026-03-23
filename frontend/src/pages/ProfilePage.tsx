import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError, api, type SubscriptionResponse, type UserPayload } from '../api/client';
import type { UiAsyncState } from '../types/ui';
import { formatDate, formatPrice } from '../utils/format';
import { toSubscriptionViewModel } from '../view-models/subscription';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { SectionHeader } from '../components/ui/SectionHeader';

type Props = {
  user: UserPayload | null;
};

export function ProfilePage({ user }: Props) {
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
  const [state, setState] = useState<UiAsyncState>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    setState('loading');

    api
      .mySubscription()
      .then((result) => {
        setSubscription(result);
        setState('success');
      })
      .catch((requestError) => {
        if (requestError instanceof ApiError && requestError.status === 404) {
          setSubscription(null);
          setState('success');
          return;
        }

        setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить подписку');
        setState('error');
      });
  }, [user]);

  const vm = useMemo(() => toSubscriptionViewModel(subscription), [subscription]);

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <section className="section-stack">
      <SectionHeader title="Профиль" subtitle="Управляйте подпиской и проверяйте актуальное состояние подключения." />

      <Card className="profile-card" as="section">
        <div className="profile-headline">
          <div className="profile-avatar">{user.email.slice(0, 2).toUpperCase()}</div>
          <div>
            <h3>{user.email}</h3>
            <p className="muted-text">Роль: {user.role}</p>
          </div>
        </div>

        {state === 'loading' ? <p>Загружаем подписку...</p> : null}
        {state === 'error' ? <p className="form-error">{error ?? 'Ошибка загрузки'}</p> : null}

        {state === 'success' ? (
          <div className="subscription-shell">
            <div className="subscription-head">
              <Badge tone={vm.state === 'active' ? 'success' : vm.state === 'pending' ? 'accent' : vm.state === 'expired' ? 'warning' : 'neutral'}>
                {vm.badge}
              </Badge>
              <h3>{vm.title}</h3>
              <p className="muted-text">{vm.subtitle}</p>
            </div>

            {vm.state === 'none' ? (
              <EmptyState
                title="Подписка не активирована"
                description="Выберите план и активируйте доступ к VPN-инфраструктуре."
                action={
                  <Button onClick={() => navigate('/plans')}>
                    Выбрать тариф
                  </Button>
                }
              />
            ) : (
              <>
                <div className="subscription-grid">
                  <Card className="sub-item" glass={false}>
                    <p className="muted-text">Тариф</p>
                    <strong>{vm.planName ?? '—'}</strong>
                  </Card>
                  <Card className="sub-item" glass={false}>
                    <p className="muted-text">Стоимость</p>
                    <strong>{vm.priceKopeks ? formatPrice(vm.priceKopeks) : '—'}</strong>
                  </Card>
                  <Card className="sub-item" glass={false}>
                    <p className="muted-text">Окончание</p>
                    <strong>{formatDate(vm.endDate)}</strong>
                  </Card>
                  <Card className="sub-item" glass={false}>
                    <p className="muted-text">{vm.progressLabel}</p>
                    <strong>{vm.daysLeft ?? '—'}</strong>
                  </Card>
                </div>

                <div className="profile-actions">
                  <Button onClick={() => navigate('/plans')}>{vm.ctaPrimary}</Button>
                  <Button variant="secondary" onClick={() => navigate('/plans')}>
                    {vm.ctaSecondary}
                  </Button>
                </div>

                {vm.connectionConfig ? (
                  <Card className="config-card" glass={false}>
                    <p className="muted-text">Конфиг подключения</p>
                    <pre>{JSON.stringify(vm.connectionConfig, null, 2)}</pre>
                  </Card>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </Card>
    </section>
  );
}
