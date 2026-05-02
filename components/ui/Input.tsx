'use client'

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes } from 'react'

const baseField =
  'w-full bg-transparent border border-hm-text/15 rounded-sm px-3.5 py-2.5 font-garamond text-[1rem] text-hm-text placeholder:text-hm-nav/50 focus:outline-none focus:border-hm-text/60 transition-colors'

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

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = '', children, ...rest }, ref) {
    return (
      <select ref={ref} className={[baseField, 'pr-8', className].join(' ')} {...rest}>
        {children}
      </select>
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
        'block font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-2',
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
        <div className="mt-1.5 font-sans text-[10px] uppercase tracking-[0.18em] text-red-700">
          {error}
        </div>
      ) : hint ? (
        <div className="mt-1.5 font-garamond text-[0.85rem] text-hm-nav/70">{hint}</div>
      ) : null}
    </div>
  )
}
