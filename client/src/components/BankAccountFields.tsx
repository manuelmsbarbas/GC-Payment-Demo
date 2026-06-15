import type { BankDetails } from '../types/filters';

interface BankAccountFieldsProps {
  bankDetails: BankDetails | null;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
}

export function BankAccountFields({ bankDetails, values, onChange, disabled }: BankAccountFieldsProps) {
  if (!bankDetails || bankDetails.displayMode === 'iban') {
    return (
      <label>
        IBAN
        <input
          required
          placeholder="DE89370400440532013000"
          value={values['iban'] ?? ''}
          onChange={e => onChange('iban', e.target.value.replace(/\s/g, ''))}
          disabled={disabled}
        />
      </label>
    );
  }

  return (
    <>
      {bankDetails.bankFields.map(field => (
        <label key={field.key}>
          {field.label}
          <input
            required
            value={values[field.key] ?? field.value}
            onChange={e => onChange(field.key, e.target.value)}
            disabled={disabled}
          />
        </label>
      ))}
      {bankDetails.iban && (
        <p className="bank-iban-hint">IBAN: {bankDetails.iban}</p>
      )}
    </>
  );
}
