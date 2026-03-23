import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api, type UserPayload } from './api/client';
import { AppLayout } from './components/layout/AppLayout';
import { AuthPage } from './pages/AuthPage';
import { PlansPage } from './pages/PlansPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';

type SessionState = 'loading' | 'ready';

export default function App() {
  const [sessionState, setSessionState] = useState<SessionState>('loading');
  const [user, setUser] = useState<UserPayload | null>(null);

  useEffect(() => {
    api
      .refresh()
      .then((result) => setUser(result.user))
      .catch(() => setUser(null))
      .finally(() => setSessionState('ready'));
  }, []);

  if (sessionState === 'loading') {
    return (
      <div className="boot-screen">
        <p>Инициализируем сессию...</p>
      </div>
    );
  }

  return (
    <AppLayout user={user} onLogout={() => setUser(null)}>
      <Routes>
        <Route path="/auth" element={<AuthPage user={user} onAuthSuccess={setUser} />} />
        <Route path="/plans" element={<PlansPage user={user} />} />
        <Route path="/profile" element={<ProfilePage user={user} />} />
        <Route path="/admin" element={<AdminPage user={user} />} />
        <Route path="*" element={<Navigate to={user ? '/profile' : '/auth'} replace />} />
      </Routes>
    </AppLayout>
  );
}
