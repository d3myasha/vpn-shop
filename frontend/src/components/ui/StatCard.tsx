import type { ReactNode } from 'react';
import { Card } from './Card';

type Props = {
  title: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
};

export function StatCard({ title, value, hint, icon }: Props) {
  return (
    <Card className="stat-card" as="article">
      <div className="stat-card__header">
        {icon ? <div className="stat-card__icon">{icon}</div> : null}
        <p>{title}</p>
      </div>
      <strong>{value}</strong>
      {hint ? <span>{hint}</span> : null}
    </Card>
  );
}
