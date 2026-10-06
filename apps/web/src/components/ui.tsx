import { AlertCircle, Info, TriangleAlert } from 'lucide-react';
import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { initials } from '../lib/format';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'whatsapp';
  size?: 'md' | 'sm';
  block?: boolean;
  loading?: boolean;
};

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  loading,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, size === 'sm' && 'btn--sm', block && 'btn--block', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  error?: string;
  prefix?: string;
  suffix?: string;
};

export function Field({ label, hint, error, prefix, suffix, className = '', id, ...rest }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  return (
    <div className="field">
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="input-wrap" data-invalid={error ? 'true' : undefined}>
        {prefix ? <span className="input-wrap__affix">{prefix}</span> : null}
        <input
          id={inputId}
          className={className}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined}
          {...rest}
        />
        {suffix ? <span className="input-wrap__affix">{suffix}</span> : null}
      </div>
      {hint && !error ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'warn' | 'info'; children: ReactNode }) {
  const Icon = tone === 'error' ? AlertCircle : tone === 'warn' ? TriangleAlert : Info;
  return (
    <div className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

const AVATAR_COLORS = ['#0f7a55', '#2f6fb0', '#9a4fb5', '#c2410c', '#b7791f', '#0e7490', '#be185d', '#4d7c0f'];

export function Avatar({ name }: { name: string }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className="avatar" style={{ background: AVATAR_COLORS[hash % AVATAR_COLORS.length] }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty__icon" aria-hidden="true">
        {icon}
      </span>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Skeleton({ height = 64, style }: { height?: number; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height, ...style }} aria-hidden="true" />;
}

export function Logo() {
  return (
    <span className="logo" aria-hidden="true">
      É
    </span>
  );
}
