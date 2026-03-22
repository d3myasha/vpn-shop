import { useEffect, useState } from 'react';
import { api, type Plan } from './api/client';
import { AuthForm } from './components/AuthForm';
import { PlanList } from './components/PlanList';

type User = { userId: string; email: string } | null;

export default function App() {
  const [user, setUser] = useState<User>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [status, setStatus] = useState('Загрузка тарифов...');
  const [subscription, setSubscription] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    api
      .plans()
      .then((result) => {
        setPlans(result.items);
        setStatus(result.items.length ? '' : 'Активных тарифов пока нет');
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : 'Ошибка загрузки тарифов'));
  }, []);

  const refreshSubscription = async () => {
    try {
      const current = await api.mySubscription();
      setSubscription(current);
    } catch {
      setSubscription(null);
    }
  };

  return (
    <main className="layout">
      <header className="header">
        <h1>d3MVpn Shop</h1>
        <p>Безопасный доступ в интернет за 2 минуты</p>
      </header>

      {!user ? (
        <section className="auth-row">
          <AuthForm
            mode="register"
            onSubmit={async (email, password) => {
              const result = await api.register(email, password);
              setUser(result.user);
              await refreshSubscription();
            }}
          />
          <AuthForm
            mode="login"
            onSubmit={async (email, password) => {
              const result = await api.login(email, password);
              setUser(result.user);
              await refreshSubscription();
            }}
          />
        </section>
      ) : (
        <section className="card">
          <h2>Профиль</h2>
          <p>{user.email}</p>
          {subscription ? (
            <pre className="subscription">{JSON.stringify(subscription, null, 2)}</pre>
          ) : (
            <p>Подписка пока не активирована.</p>
          )}
        </section>
      )}

      <section>
        <h2>Тарифы</h2>
        {status ? <p>{status}</p> : null}
        <PlanList
          plans={plans}
          onBuy={async (planId) => {
            if (!user) {
              alert('Сначала войдите в аккаунт');
              return;
            }

            const result = await api.buy(planId);
            if (result.paymentUrl) {
              window.location.href = result.paymentUrl;
            }
          }}
        />
      </section>
    </main>
  );
}
