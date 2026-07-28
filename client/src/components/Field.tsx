import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

import { Icon } from './Icon';

type BaseProps = {
  label: string;
  /** Steady guidance. Replaced by `error` when one is present — never both at once. */
  helper?: string;
  error?: string;
  required?: boolean;
};

/**
 * Label above, helper below, error replacing helper in the same slot.
 *
 * The helper line reserves its height whether or not it has content, so a
 * validation message appearing does not shove the rest of the form downward.
 */
function FieldShell({
  label,
  helper,
  error,
  required,
  id,
  describedById,
  children,
}: BaseProps & { id: string; describedById: string; children: ReactNode }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {required ? (
          <>
            {' '}
            <span className="field__required" aria-hidden="true">
              *
            </span>
          </>
        ) : null}
      </label>

      <div className="field__control">{children}</div>

      <p className="field__helper" id={describedById} data-tone={error ? 'error' : undefined}>
        {error ? (
          <>
            <Icon name="alert" size={13} />
            <span>{error}</span>
          </>
        ) : (
          (helper ?? '')
        )}
      </p>
    </div>
  );
}

type TextFieldProps = BaseProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id' | 'required'>;

export function TextField({ label, helper, error, required, ...rest }: TextFieldProps) {
  const id = useId();
  const describedById = `${id}-help`;

  return (
    <FieldShell
      label={label}
      helper={helper}
      error={error}
      required={required}
      id={id}
      describedById={describedById}
    >
      <input
        {...rest}
        id={id}
        className="input"
        required={required}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedById}
      />
    </FieldShell>
  );
}

type TextAreaFieldProps = BaseProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className' | 'id' | 'required'>;

export function TextAreaField({ label, helper, error, required, ...rest }: TextAreaFieldProps) {
  const id = useId();
  const describedById = `${id}-help`;

  return (
    <FieldShell
      label={label}
      helper={helper}
      error={error}
      required={required}
      id={id}
      describedById={describedById}
    >
      <textarea
        {...rest}
        id={id}
        className="textarea"
        required={required}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedById}
      />
    </FieldShell>
  );
}

type SelectFieldProps = BaseProps & {
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  name?: string;
};

/**
 * Native `<select>`, styled through its wrapper.
 *
 * A custom listbox would need keyboard handling, typeahead, and screen-reader
 * semantics rebuilt from scratch to match what the platform already ships.
 */
export function SelectField({
  label,
  helper,
  error,
  required,
  value,
  onChange,
  options,
  name,
}: SelectFieldProps) {
  const id = useId();
  const describedById = `${id}-help`;

  return (
    <FieldShell
      label={label}
      helper={helper}
      error={error}
      required={required}
      id={id}
      describedById={describedById}
    >
      <select
        id={id}
        name={name}
        className="select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={describedById}
        aria-invalid={error ? true : undefined}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}
