import type { Plan } from '../api/client';

type Props = {
  plans: Plan[];
  onBuy: (planId: string) => Promise<void>;
};

export function PlanList({ plans, onBuy }: Props) {
  if (plans.length === 0) {
    return <div className="card">Нет активных тарифов</div>;
  }

  return (
    <div className="grid">
      {plans.map((plan) => (
        <article className="card" key={plan.id}>
          <h3>{plan.name}</h3>
          <p>{plan.description ?? 'Без ограничений по серверам и протоколам'}</p>
          <p className="price">{(plan.priceKopeks / 100).toFixed(2)} ₽</p>
          <p>{plan.durationDays} дней</p>
          <button onClick={() => onBuy(plan.id)}>Купить</button>
        </article>
      ))}
    </div>
  );
}
