import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonState = 'idle' | 'loading' | 'error' | 'success';

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  variant?: Variant;
  size?: 'md' | 'sm';
  block?: boolean;
  state?: ButtonState;
  /** Replaces the label while loading, so the control never resizes mid-action. */
  loadingLabel?: string;
  leading?: ReactNode;
  children: ReactNode;
};

/**
 * All eight states live here: default, hover, focus-visible, active, disabled,
 * loading, error, success — hover and focus in CSS, the rest driven by `state`.
 *
 * A loading button is disabled but keeps its label visible and its width stable;
 * swapping the text for a bare spinner makes the row jump and loses the context
 * of what is actually in flight.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  block = false,
  state = 'idle',
  loadingLabel,
  leading,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isLoading = state === 'loading';

  const classes = [
    'btn',
    `btn--${variant}`,
    size === 'sm' ? 'btn--sm' : '',
    block ? 'btn--block' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...rest}
      type={type}
      className={classes}
      data-state={state}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
    >
      {isLoading ? <span className="btn__spinner" /> : leading}
      <span className="btn__label">{isLoading ? (loadingLabel ?? children) : children}</span>
    </button>
  );
}
