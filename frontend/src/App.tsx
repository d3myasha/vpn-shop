import { useEffect, useState } from 'react';
import { api, type Plan, type UserPayload } from './api/client';
import { AuthForm } from './components/AuthForm';
import { PlanList } from './components/PlanList';

type User = UserPayload | null;
type View = 'dashboard' | 'plans' | 'admin';

export default function App() {
  const [user, setUser] = useState<User>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [adminPlans, setAdminPlans] = useState<Plan[]>([]);
  const [adminUsers, setAdminUsers] = useState<Array<{ id: string; email: string; role: string; createdAt: string }>>([]);
  const [adminStats, setAdminStats] = useState<{
    totalUsers: number;
    activeSubscriptions: number;
    totalRevenueKopeks: number;
    lifetimeRevenueKopeks: number;
  } | null>(null);
  const [status, setStatus] = useState('Загрузка тарифов...');
  const [subscription, setSubscription] = useState<Record<string, unknown> | null>(null);
  const [view, setView] = useState<View>('dashboard');
  const [adminSearch, setAdminSearch] = useState('');

  useEffect(() => {
    api
      .refresh()
      .then(async (result) => {
        setUser(result.user);
        await refreshSubscription();
      })
      .catch(() => {
        setUser(null);
      });

    api
      .plans()
      .then((result) => {
        setPlans(result.items);
        setStatus(result.items.length ? '' : 'Активных тарифов пока нет');
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : 'Ошибка загрузки тарифов'));
  }, []);

  const refreshAdmin = async () => {
    if (user?.role !== 'admin') {
      return;
    }

    const [plansResult, usersResult, statsResult] = await Promise.all([
      api.adminPlans(),
      api.adminUsers(adminSearch),
      api.adminStats()
    ]);
    setAdminPlans(plansResult.items);
    setAdminUsers(usersResult.items);
    setAdminStats(statsResult);
  };

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

      <nav className="tabs">
        <button onClick={() => setView('dashboard')}>Профиль</button>
        <button onClick={() => setView('plans')}>Подписка</button>
        {user?.role === 'admin' ? (
          <button
            onClick={async () => {
              setView('admin');
              await refreshAdmin();
            }}
          >
            Админ
          </button>
        ) : null}
      </nav>

      {!user && view !== 'plans' ? (
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
        <>
          {view === 'dashboard' && user ? (
            <section className="card">
              <h2>Профиль</h2>
              <p>{user.email}</p>
              <p>Роль: {user.role}</p>
              {subscription ? (
                <pre className="subscription">{JSON.stringify(subscription, null, 2)}</pre>
              ) : (
                <p>Подписка пока не активирована.</p>
              )}
            </section>
          ) : null}
        </>
      )}

      {view === 'plans' ? (
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
      ) : null}

      {view === 'admin' && user?.role === 'admin' ? (
        <section className="card">
          <h2>Админ-панель</h2>
          <div className="admin-grid">
            <div className="card">
              <h3>Статистика</h3>
              <p>Пользователи: {adminStats?.totalUsers ?? 0}</p>
              <p>Активные подписки: {adminStats?.activeSubscriptions ?? 0}</p>
              <p>Доход за 30 дней: {((adminStats?.totalRevenueKopeks ?? 0) / 100).toFixed(2)} ₽</p>
              <p>Доход за всё время: {((adminStats?.lifetimeRevenueKopeks ?? 0) / 100).toFixed(2)} ₽</p>
            </div>

            <div className="card">
              <h3>Планы</h3>
              <button
                onClick={async () => {
                  await api.createPlan({
                    name: 'Новый план',
                    description: 'Описание',
                    priceKopeks: 10000,
                    durationDays: 30,
                    trafficLimitGb: 100,
                    remnawaveTemplateUuid: '44444444-4444-4444-4444-444444444444',
                    sortOrder: 100,
                    isActive: true
                  });
                  await refreshAdmin();
                }}
              >
                Добавить план
              </button>
              {adminPlans.map((plan) => (
                <div className="admin-item" key={plan.id}>
                  <span>{plan.name}</span>
                  <span>{(plan.priceKopeks / 100).toFixed(2)} ₽</span>
                  <button
                    onClick={async () => {
                      await api.updatePlan(plan.id, { isActive: !plan.isActive });
                      await refreshAdmin();
                    }}
                  >
                    {plan.isActive ? 'Выключить' : 'Включить'}
                  </button>
                  <button
                    onClick={async () => {
                      await api.deletePlan(plan.id);
                      await refreshAdmin();
                    }}
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </div>

            <div className="card">
              <h3>Пользователи</h3>
              <div className="search-row">
                <input value={adminSearch} onChange={(event) => setAdminSearch(event.target.value)} placeholder="email/telegram" />
                <button onClick={refreshAdmin}>Поиск</button>
              </div>
              {adminUsers.map((item) => (
                <div className="admin-item" key={item.id}>
                  <span>{item.email}</span>
                  <span>{item.role}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
