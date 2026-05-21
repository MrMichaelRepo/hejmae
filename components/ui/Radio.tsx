'use client'

import { forwardRef, type InputHTMLAttributes } from 'react'

export interface RadioProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: React.ReactNode
  hint?: React.ReactNode
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { label, hint, className = '', disabled, checked, ...rest },
  ref,
) {
  return (
    <label
      className={[
        'group inline-flex items-center gap-3',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        className,
      ].join(' ')}
    >
      <span
        className={[
          'relative inline-flex items-center justify-center w-4 h-4 shrink-0 rounded-full border transition-colors duration-150 ease-out-soft',
          checked
            ? 'border-accent bg-surface'
            : 'border-line bg-surface group-hover:border-line-strong',
          disabled ? 'opacity-50' : '',
        ].join(' ')}
        aria-hidden
      >
        <input
          ref={ref}
          type="radio"
          checked={checked}
          disabled={disabled}
          className="absolute inset-0 opacity-0 cursor-pointer peer"
          {...rest}
        />
        {checked ? <span className="w-2 h-2 rounded-full bg-accent" /> : null}
        <span
          className="absolute -inset-1 rounded-full pointer-events-none peer-focus-visible:shadow-focus"
          aria-hidden
        />
      </span>
      {label ? (
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
      ) : null}
    </label>
  )
})
