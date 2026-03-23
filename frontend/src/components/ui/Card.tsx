import type { HTMLAttributes } from 'react';

type Props = HTMLAttributes<HTMLElement> & {
  as?: 'article' | 'section' | 'div';
  glass?: boolean;
};

export function Card({ as = 'div', glass = true, className, children, ...props }: Props) {
  const Component = as;
  const classNames = ['ui-card', glass ? 'ui-card--glass' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <Component className={classNames} {...props}>
      {children}
    </Component>
  );
}
