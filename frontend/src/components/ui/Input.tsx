import type { InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | null;
};

export function Input({ label, error, id, className, ...props }: Props) {
  return (
    <label className="ui-input-wrap" htmlFor={id}>
      <span className="ui-label">{label}</span>
      <input id={id} className={["ui-input", error ? 'ui-input--error' : '', className ?? ''].filter(Boolean).join(' ')} {...props} />
      {error ? <span className="ui-input-error">{error}</span> : null}
    </label>
  );
}
