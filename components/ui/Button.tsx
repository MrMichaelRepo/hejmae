'use client'

import { forwardRef, type ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const VARIANTS: Record<Variant, string> = {
  // Default high-emphasis button — dark ink on cream
  primary:
    'bg-ink text-bg border border-ink hover:bg-ink/90 focus-visible:shadow-focus',
  // Hairline outline — the workhorse
  secondary:
    'bg-transparent text-ink border border-ink/20 hover:border-ink hover:bg-ink hover:text-bg focus-visible:shadow-focus',
  // Tertiary, no chrome until hover
  ghost:
    'bg-transparent text-ink-muted hover:text-ink hover:bg-ink/[0.04] border border-transparent focus-visible:shadow-focus',
  // Destructive — muted brick, never bright red
  danger:
    'bg-transparent text-danger border border-danger/30 hover:bg-danger hover:text-bg focus-visible:shadow-focus',
  // Single brand accent — use sparingly, e.g. "Save & send"
  accent:
    'bg-accent text-bg border border-accent hover:bg-accent-hover focus-visible:shadow-focus',
}

const SIZES: Record<Size, string> = {
  sm: 'px-4 py-1.5 text-[10px]',
  md: 'px-6 py-2.5 text-[11px]',
  lg: 'px-8 py-3 text-[12px]',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, disabled, className = '', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center gap-2 font-sans uppercase tracking-[0.2em] rounded-full transition-all duration-150 ease-out-soft outline-none disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  )
})

export default Button

function Spinner() {
  return (
    <svg
      className="animate-spin h-3 w-3"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  )
}
