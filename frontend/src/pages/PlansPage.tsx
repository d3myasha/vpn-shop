import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Plan, type UserPayload } from '../api/client';
import type { UiAsyncState, UiBillingMode } from '../types/ui';
import { formatPrice } from '../utils/format';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { SectionHeader } from '../components/ui/SectionHeader';
import { Tabs } from '../components/ui/Tabs';

type Props = {
  user: UserPayload | null;
};

const YEARLY_DISCOUNT = 0.4;

export function PlansPage({ user }: Props) {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [state, setState] = useState<UiAsyncState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [billingMode, setBillingMode] = useState<UiBillingMode>('monthly');
  const [buyingPlanId, setBuyingPlanId] = useState<string | null>(null);

  useEffect(() => {
    api
      .plans()
      .then((result) => {
        setPlans(result.items);
        setState('success');
      })
      .catch((requestError) => {
        setState('error');
        setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить тарифы');
      });
  }, []);

  const featuredPlanId = useMemo(() => {
    if (!plans.length) {
      return null;
    }

    const sorted = [...plans].sort((a, b) => b.priceKopeks - a.priceKopeks);
    return sorted[Math.floor(sorted.length / 2)]?.id ?? plans[0].id;
  }, [plans]);

  const buy = async (plan: Plan) => {
    if (!user) {
      navigate('/auth');
      return;
    }

    setBuyingPlanId(plan.id);

    try {
      const result = await api.buy(plan.id);
      if (result.paymentUrl) {
        window.location.href = result.paymentUrl;
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось запустить оплату');
    } finally {
      setBuyingPlanId(null);
    }
  };

  const renderContent = () => {
    if (state === 'loading') {
      return <Card className="state-card">Загружаем тарифы...</Card>;
    }

    if (state === 'error') {
      return (
        <Card className="state-card">
          <p>{error ?? 'Ошибка загрузки'}</p>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Перезагрузить
          </Button>
        </Card>
      );
    }

    if (plans.length === 0) {
      return <EmptyState title="Нет активных тарифов" description="Тарифы появятся после публикации в админ-панели." />;
    }

    return (
      <div className="pricing-grid">
        {plans.map((plan) => {
          const monthly = plan.priceKopeks;
          const yearlyMonthlyEquivalent = Math.round(monthly * (1 - YEARLY_DISCOUNT));
          const priceToShow = billingMode === 'monthly' ? monthly : yearlyMonthlyEquivalent;
          const isFeatured = featuredPlanId === plan.id;

          return (
            <Card key={plan.id} className={["pricing-card", isFeatured ? 'is-featured' : ''].filter(Boolean).join(' ')} as="article">
              {isFeatured ? <Badge tone="accent">Рекомендуем</Badge> : null}
              <h3>{plan.name}</h3>
              <p className="muted-text">{plan.description ?? 'Стабильное соединение и приватный трафик.'}</p>

              <div className="pricing-price-row">
                <span className="pricing-price">{formatPrice(priceToShow)}</span>
                {billingMode === 'yearly' ? <span className="pricing-old-price">{formatPrice(monthly)}</span> : null}
              </div>
              <p className="muted-text">{billingMode === 'monthly' ? 'за месяц' : 'за месяц при оплате за год'}</p>

              <ul className="pricing-meta">
                <li>{plan.durationDays} дней доступа</li>
                <li>{plan.trafficLimitGb ? `${plan.trafficLimitGb} GB` : 'Безлимитный трафик'}</li>
                <li>Поддержка 24/7</li>
              </ul>

              <Button fullWidth loading={buyingPlanId === plan.id} onClick={() => buy(plan)}>
                Выбрать тариф
              </Button>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <section className="section-stack">
      <SectionHeader
        title="Тарифы"
        subtitle="Выберите план под ваш формат использования. Переключатель годовой оплаты влияет только на отображение цен в UI."
        action={
          <Tabs
            tabs={[
              { id: 'monthly', label: 'Ежемесячно' },
              { id: 'yearly', label: 'Ежегодно (-40%)' }
            ]}
            activeId={billingMode}
            onChange={(value) => setBillingMode(value as UiBillingMode)}
          />
        }
      />

      {error && state === 'success' ? <Card className="state-card error-inline">{error}</Card> : null}

      {renderContent()}
    </section>
  );
}
