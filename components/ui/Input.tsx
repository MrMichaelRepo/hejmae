'use client'

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes } from 'react'

const baseField =
  'w-full bg-surface border border-line rounded px-3.5 py-2.5 font-garamond text-[1rem] text-ink placeholder:text-ink-subtle outline-none transition-all duration-150 ease-out-soft focus:border-accent focus:shadow-focus'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...rest }, ref) {
    return <input ref={ref} className={[baseField, className].join(' ')} {...rest} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = '', rows = 4, ...rest }, ref) {
    return <textarea ref={ref} rows={rows} className={[baseField, 'resize-y', className].join(' ')} {...rest} />
  },
)

// Custom-chevron select. We hide the OS dropdown indicator with
// `appearance-none` and render our own SVG so the field looks identical
// across Safari, Chrome, and Firefox.
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = '', children, ...rest }, ref) {
    return (
      <span className="relative block w-full">
        <select
          ref={ref}
          className={[
            baseField,
            'pr-9 appearance-none bg-no-repeat cursor-pointer',
            className,
          ].join(' ')}
          {...rest}
        >
          {children}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 12 8"
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-3 h-2 text-ink-subtle"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 1.5l5 5 5-5" />
        </svg>
      </span>
    )
  },
)

export function Label({
  children,
  htmlFor,
  className = '',
}: {
  children: React.ReactNode
  htmlFor?: string
  className?: string
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={[
        'block font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-2',
        className,
      ].join(' ')}
    >
      {children}
    </label>
  )
}

export function Field({
  label,
  children,
  hint,
  error,
}: {
  label?: string
  children: React.ReactNode
  hint?: string
  error?: string | null
}) {
  return (
    <div className="mb-5">
      {label ? <Label>{label}</Label> : null}
      {children}
      {error ? (
        <div className="mt-1.5 font-sans text-[10px] uppercase tracking-[0.18em] text-danger">
          {error}
        </div>
      ) : hint ? (
        <div className="mt-1.5 font-garamond text-[0.85rem] text-ink-muted/80">{hint}</div>
      ) : null}
    </div>
  )
}
