import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, type UserPayload } from '../api/client';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Tabs } from '../components/ui/Tabs';

type Props = {
  user: UserPayload | null;
  onAuthSuccess: (user: UserPayload) => void;
};

type Mode = 'login' | 'register';

export function AuthPage({ user, onAuthSuccess }: Props) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) {
    return <Navigate to="/profile" replace />;
  }

  const submit = async () => {
    setError(null);

    if (mode === 'register' && password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    setLoading(true);

    try {
      const result = mode === 'login' ? await api.login(email, password) : await api.register(email, password);
      onAuthSuccess(result.user);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Ошибка авторизации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-page">
      <Card className="auth-card" as="section">
        <p className="app-kicker">Добро пожаловать</p>
        <h2>Вход и регистрация</h2>
        <p className="muted-text">Единый доступ к подписке, устройствам и управлению тарифами.</p>

        <Tabs
          tabs={[
            { id: 'login', label: 'Вход' },
            { id: 'register', label: 'Регистрация' }
          ]}
          activeId={mode}
          onChange={(value) => setMode(value as Mode)}
        />

        <form
          className="auth-form"
          onSubmit={async (event) => {
            event.preventDefault();
            await submit();
          }}
        >
          <Input id="auth-email" label="E-mail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <Input
            id="auth-password"
            label="Пароль"
            type="password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          {mode === 'register' ? (
            <Input
              id="auth-confirm-password"
              label="Подтверждение пароля"
              type="password"
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          ) : null}

          {error ? <p className="form-error">{error}</p> : null}

          <Button type="submit" fullWidth loading={loading}>
            {mode === 'login' ? 'Войти' : 'Создать аккаунт'}
          </Button>
        </form>

        <div className="social-grid">
          <Button variant="secondary" fullWidth disabled>
            Google (скоро)
          </Button>
          <Button variant="secondary" fullWidth disabled>
            GitHub (скоро)
          </Button>
        </div>
      </Card>
    </section>
  );
}
