'use client'

import { forwardRef, type InputHTMLAttributes } from 'react'

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: React.ReactNode
  hint?: React.ReactNode
  align?: 'center' | 'start'
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    { label, hint, align = 'center', className = '', disabled, checked, ...rest },
    ref,
  ) {
    const inner = (
      <span
        className={[
          'relative inline-flex items-center justify-center w-4 h-4 shrink-0 rounded-sm border transition-colors duration-150 ease-out-soft',
          checked
            ? 'bg-accent border-accent text-bg'
            : 'bg-surface border-line group-hover:border-line-strong',
          disabled ? 'opacity-50' : '',
        ].join(' ')}
        aria-hidden
      >
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          className="absolute inset-0 opacity-0 cursor-pointer focus-visible:outline-none peer"
          {...rest}
        />
        {checked ? (
          <svg
            viewBox="0 0 20 20"
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 10.5l4 4 8-9" />
          </svg>
        ) : null}
        <span
          className="absolute -inset-1 rounded-sm pointer-events-none peer-focus-visible:shadow-focus"
          aria-hidden
        />
      </span>
    )

    if (!label) {
      return (
        <label
          className={[
            'group inline-flex',
            disabled ? 'cursor-not-allowed' : 'cursor-pointer',
            className,
          ].join(' ')}
        >
          {inner}
        </label>
      )
    }

    return (
      <label
        className={[
          'group inline-flex gap-3',
          align === 'start' ? 'items-start' : 'items-center',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer',
          className,
        ].join(' ')}
      >
        {inner}
        <span className="min-w-0">
          <span className="block font-garamond text-[0.95rem] text-ink leading-snug">
            {label}
          </span>
          {hint ? (
            <span className="block font-garamond text-[0.85rem] text-ink-muted leading-snug mt-0.5">
              {hint}
            </span>
          ) : null}
        </span>
      </label>
    )
  },
)
