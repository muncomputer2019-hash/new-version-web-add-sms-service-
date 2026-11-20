import React from 'react';

export interface MobileNumberInputProps {
  id?: string;
  value: string;
  onChange: (digitsOnly: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  maxLength?: number;
  className?: string;
  inputClassName?: string;
  heightClassName?: string;
  allowOptionalEmpty?: boolean;
  'aria-label'?: string;
}

export function sanitizeIndianMobileInput(raw: string, maxLength = 10): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.length > maxLength && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  return digits.slice(0, maxLength);
}

export const MobileNumberInput: React.FC<MobileNumberInputProps> = ({
  id,
  value,
  onChange,
  placeholder = '9830000000',
  required = false,
  disabled = false,
  maxLength = 10,
  className = '',
  inputClassName = '',
  heightClassName = 'h-9',
  'aria-label': ariaLabel,
}) => {
  return (
    <div
      className={`flex rounded-md border border-neutral-300 dark:border-neutral-700 overflow-hidden bg-white dark:bg-neutral-950 focus-within:border-blue-800 ${className}`.trim()}
    >
      <span className="inline-flex items-center px-3 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-xs font-mono font-medium border-r border-neutral-300 dark:border-neutral-700 select-none shrink-0">
        +91
      </span>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        required={required}
        disabled={disabled}
        maxLength={maxLength}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(sanitizeIndianMobileInput(e.target.value, maxLength))}
        placeholder={placeholder}
        className={`w-full ${heightClassName} px-3 border-0 bg-transparent text-sm font-mono text-neutral-950 dark:text-white focus:outline-none disabled:opacity-70 ${inputClassName}`.trim()}
      />
    </div>
  );
};
