import type { PropsWithChildren } from 'react';
import { NavLink } from 'react-router-dom';
import type { UserPayload } from '../../api/client';
import { Button } from '../ui/Button';

type Props = PropsWithChildren<{
  user: UserPayload | null;
  onLogout: () => Promise<void> | void;
}>;

export function AppLayout({ user, onLogout, children }: Props) {
  return (
    <div className="app-shell">
      <div className="app-glow app-glow--one" />
      <div className="app-glow app-glow--two" />

      <header className="app-header">
        <div>
          <p className="app-kicker">D3MVPN Web App</p>
          <h1>Control Center</h1>
          <p className="app-subtitle">Безопасный интернет с быстрым подключением и прозрачным управлением подпиской.</p>
        </div>

        <div className="app-header__actions">
          {user ? <span className="app-user-pill">{user.email}</span> : <span className="app-user-pill muted">Гость</span>}
          {user ? (
            <Button variant="ghost" size="sm" onClick={onLogout}>
              Выйти
            </Button>
          ) : null}
        </div>
      </header>

      <nav className="main-nav">
        <NavLink to="/auth" className={({ isActive }) => (isActive ? 'is-active' : '')}>
          Auth
        </NavLink>
        <NavLink to="/plans" className={({ isActive }) => (isActive ? 'is-active' : '')}>
          Тарифы
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => (isActive ? 'is-active' : '')}>
          Профиль
        </NavLink>
        {user?.role === 'admin' ? (
          <NavLink to="/admin" className={({ isActive }) => (isActive ? 'is-active' : '')}>
            Админ
          </NavLink>
        ) : null}
      </nav>

      <main>{children}</main>
    </div>
  );
}
