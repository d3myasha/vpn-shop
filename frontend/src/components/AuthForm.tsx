import { useState } from 'react';

type Props = {
  mode: 'login' | 'register';
  onSubmit: (email: string, password: string) => Promise<void>;
};

export function AuthForm({ mode, onSubmit }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = mode === 'login' ? 'Вход' : 'Регистрация';

  return (
    <form
      className="card"
      onSubmit={async (event) => {
        event.preventDefault();
        setLoading(true);
        setError(null);
        try {
          await onSubmit(email, password);
        } catch (submissionError) {
          setError(submissionError instanceof Error ? submissionError.message : 'Ошибка запроса');
        } finally {
          setLoading(false);
        }
      }}
    >
      <h2>{title}</h2>
      <label>
        E-mail
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </label>
      <label>
        Пароль
        <input
          type="password"
          value={password}
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <button type="submit" disabled={loading}>
        {loading ? 'Обработка...' : title}
      </button>
    </form>
  );
}
