import { useId } from 'react';

const group = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

// Grand champ de montant : on tape « 3500 », on lit « 3 500 F ».
export function AmountInput({
  value,
  onChange,
  label,
  error,
  autoFocus,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  label: string;
  error?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      <div className="amount-input" data-invalid={error ? 'true' : undefined}>
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          autoFocus={autoFocus}
          value={value === null ? '' : group.format(value).replace(/\u202F/g, '\u00A0')}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
            onChange(digits ? Number(digits) : null);
          }}
        />
        <span aria-hidden="true">F</span>
      </div>
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
