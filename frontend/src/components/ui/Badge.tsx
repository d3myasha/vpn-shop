import type { HTMLAttributes } from 'react';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
};

export function Badge({ tone = 'neutral', className, children, ...props }: Props) {
  return (
    <span className={['ui-badge', `ui-badge--${tone}`, className ?? ''].filter(Boolean).join(' ')} {...props}>
      {children}
    </span>
  );
}
