import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, type AdminStats, type AdminUser, type Plan, type UserPayload } from '../api/client';
import type { UiAsyncState } from '../types/ui';
import { formatDate, formatPrice } from '../utils/format';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { SectionHeader } from '../components/ui/SectionHeader';
import { StatCard } from '../components/ui/StatCard';
import { Tabs } from '../components/ui/Tabs';

type Props = {
  user: UserPayload | null;
};

type AdminSection = 'dashboard' | 'plans' | 'users';

const defaultPlanPayload: Omit<Plan, 'id'> = {
  name: 'Новый план',
  description: 'Описание тарифа',
  priceKopeks: 10000,
  durationDays: 30,
  trafficLimitGb: 100,
  remnawaveTemplateUuid: '44444444-4444-4444-4444-444444444444',
  sortOrder: 100,
  isActive: true
};

export function AdminPage({ user }: Props) {
  const [section, setSection] = useState<AdminSection>('dashboard');
  const [state, setState] = useState<UiAsyncState>('loading');
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);

  const [search, setSearch] = useState('');
  const [searchInFlight, setSearchInFlight] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = async (query = search) => {
    setState('loading');
    setError(null);

    try {
      const [statsResult, plansResult, usersResult] = await Promise.all([
        api.adminStats(),
        api.adminPlans(),
        api.adminUsers(query)
      ]);

      setStats(statsResult);
      setPlans(plansResult.items);
      setUsers(usersResult.items);
      setState('success');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Ошибка загрузки админ-данных');
      setState('error');
    }
  };

  useEffect(() => {
    if (user?.role !== 'admin') {
      return;
    }

    void reload();
  }, [user]);

  const summaryCards = useMemo(
    () => [
      { title: 'Пользователи', value: String(stats?.totalUsers ?? 0), hint: 'Всего в системе' },
      { title: 'Активные подписки', value: String(stats?.activeSubscriptions ?? 0), hint: 'Текущее состояние' },
      { title: 'Доход за 30 дней', value: formatPrice(stats?.totalRevenueKopeks ?? 0), hint: 'Сумма успешных платежей' },
      { title: 'Доход за всё время', value: formatPrice(stats?.lifetimeRevenueKopeks ?? 0), hint: 'Накопленный оборот' }
    ],
    [stats]
  );

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (user.role !== 'admin') {
    return (
      <EmptyState
        title="Недостаточно прав"
        description="Этот раздел доступен только администраторам."
      />
    );
  }

  return (
    <section className="admin-page-grid">
      <Card className="admin-sidebar" as="aside">
        <p className="app-kicker">Панель администратора</p>
        <h3>Control board</h3>
        <Tabs
          tabs={[
            { id: 'dashboard', label: 'Дашборд' },
            { id: 'plans', label: 'Тарифы' },
            { id: 'users', label: 'Пользователи' }
          ]}
          activeId={section}
          onChange={(value) => setSection(value as AdminSection)}
          className="admin-tabs"
        />

        <Button variant="secondary" onClick={() => void reload()}>
          Обновить данные
        </Button>
      </Card>

      <div className="section-stack">
        <SectionHeader
          title="Админка"
          subtitle="Управление тарифами, пользователями и метриками в едином пространстве."
          action={
            <Badge tone={state === 'error' ? 'danger' : state === 'loading' ? 'warning' : 'success'}>
              {state === 'loading' ? 'Загрузка...' : state === 'error' ? 'Ошибка' : 'Синхронизировано'}
            </Badge>
          }
        />

        {error ? <Card className="state-card">{error}</Card> : null}

        {section === 'dashboard' ? (
          <div className="admin-metrics-grid">
            {summaryCards.map((item) => (
              <StatCard key={item.title} title={item.title} value={item.value} hint={item.hint} />
            ))}
          </div>
        ) : null}

        {section === 'plans' ? (
          <Card as="section">
            <SectionHeader
              title="Тарифы"
              subtitle="Быстрое управление состоянием плана без смены API-контракта."
              action={
                <Button
                  loading={saving}
                  onClick={async () => {
                    setSaving(true);
                    setError(null);
                    try {
                      await api.createPlan(defaultPlanPayload);
                      await reload();
                    } catch (requestError) {
                      setError(requestError instanceof Error ? requestError.message : 'Ошибка создания плана');
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  Добавить план
                </Button>
              }
            />

            {plans.length === 0 ? (
              <EmptyState title="Планы не найдены" description="Создайте первый план, чтобы открыть продажи." />
            ) : (
              <div className="admin-list">
                {plans.map((plan) => (
                  <Card className="admin-row" key={plan.id} glass={false}>
                    <div>
                      <h4>{plan.name}</h4>
                      <p className="muted-text">{plan.description ?? 'Без описания'}</p>
                    </div>

                    <div className="admin-row__meta">
                      <Badge tone={plan.isActive ? 'success' : 'neutral'}>{plan.isActive ? 'Активен' : 'Выключен'}</Badge>
                      <span>{formatPrice(plan.priceKopeks)}</span>
                    </div>

                    <div className="admin-row__actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          if (!window.confirm(plan.isActive ? 'Отключить этот план?' : 'Включить этот план?')) {
                            return;
                          }

                          try {
                            await api.updatePlan(plan.id, { isActive: !plan.isActive });
                            await reload();
                          } catch (requestError) {
                            setError(requestError instanceof Error ? requestError.message : 'Ошибка обновления плана');
                          }
                        }}
                      >
                        {plan.isActive ? 'Отключить' : 'Включить'}
                      </Button>

                      <Button
                        variant="danger"
                        size="sm"
                        onClick={async () => {
                          if (!window.confirm('Удалить (деактивировать) план?')) {
                            return;
                          }

                          try {
                            await api.deletePlan(plan.id);
                            await reload();
                          } catch (requestError) {
                            setError(requestError instanceof Error ? requestError.message : 'Ошибка удаления плана');
                          }
                        }}
                      >
                        Удалить
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Card>
        ) : null}

        {section === 'users' ? (
          <Card as="section">
            <SectionHeader
              title="Пользователи"
              subtitle="Поиск по email/telegram и просмотр последних подписок."
              action={
                <form
                  className="admin-search"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    setSearchInFlight(true);
                    try {
                      await reload(search);
                    } finally {
                      setSearchInFlight(false);
                    }
                  }}
                >
                  <Input
                    id="admin-user-search"
                    label="Поиск"
                    placeholder="email или telegram"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <Button type="submit" loading={searchInFlight}>
                    Найти
                  </Button>
                </form>
              }
            />

            {users.length === 0 ? (
              <EmptyState title="Ничего не найдено" description="Измените запрос и попробуйте снова." />
            ) : (
              <div className="admin-list">
                {users.map((item) => {
                  const latest = item.subscriptions?.[0];

                  return (
                    <Card key={item.id} className="admin-row" glass={false}>
                      <div>
                        <h4>{item.email}</h4>
                        <p className="muted-text">Создан: {formatDate(item.createdAt)}</p>
                      </div>

                      <div className="admin-row__meta">
                        <Badge tone={item.role === 'admin' ? 'accent' : 'neutral'}>{item.role}</Badge>
                        <Badge tone={latest?.status === 'active' ? 'success' : latest?.status === 'pending' ? 'accent' : 'warning'}>
                          {latest?.status ?? 'no-subscription'}
                        </Badge>
                      </div>

                      <div>
                        <p className="muted-text">{latest?.plan?.name ?? 'Нет активного плана'}</p>
                        <p className="muted-text">{latest?.endDate ? `До ${formatDate(latest.endDate)}` : '—'}</p>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </Card>
        ) : null}
      </div>
    </section>
  );
}
