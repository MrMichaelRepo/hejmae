'use client'

import { forwardRef, type ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-hm-text text-bg hover:bg-hm-text/90 border border-hm-text',
  secondary:
    'bg-transparent text-hm-text border border-hm-text/25 hover:bg-hm-text hover:text-bg',
  ghost:
    'bg-transparent text-hm-nav hover:text-hm-text hover:bg-hm-text/[0.04] border border-transparent',
  danger:
    'bg-transparent text-red-700 border border-red-700/30 hover:bg-red-700 hover:text-bg',
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
        'inline-flex items-center justify-center gap-2 font-sans uppercase tracking-[0.2em] rounded-full transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed',
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
