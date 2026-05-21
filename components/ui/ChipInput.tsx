'use client'

import { useId } from 'react'

// Bordered chip-style multi-value input. Used for email recipients,
// arbitrary tags, etc. Validation is delegated to the parent via
// `validate` — if it returns false the value is rejected silently.
export default function ChipInput({
  values,
  setValues,
  draft,
  setDraft,
  placeholder,
  validate,
  inputType = 'text',
  disabled,
}: {
  values: string[]
  setValues: (v: string[]) => void
  draft: string
  setDraft: (v: string) => void
  placeholder?: string
  validate?: (v: string) => boolean
  inputType?: 'text' | 'email'
  disabled?: boolean
}) {
  const id = useId()
  const commit = (raw: string) => {
    const v = raw.trim().replace(/,$/, '')
    if (!v) return
    if (validate && !validate(v)) return
    if (values.includes(v)) {
      setDraft('')
      return
    }
    setValues([...values, v])
    setDraft('')
  }
  return (
    <div
      className={[
        'flex flex-wrap items-center gap-1.5 bg-surface border border-line rounded px-2 py-1.5 min-h-[42px] focus-within:border-accent focus-within:shadow-focus transition-all duration-150 ease-out-soft',
        disabled ? 'opacity-60' : '',
      ].join(' ')}
      onClick={() => document.getElementById(id)?.focus()}
    >
      {values.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1.5 border border-line bg-bg-elevated px-2 py-0.5 rounded-sm font-garamond text-[0.9rem] text-ink"
        >
          {v}
          {disabled ? null : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setValues(values.filter((x) => x !== v))
              }}
              className="text-ink-subtle hover:text-ink transition-colors"
              aria-label={`Remove ${v}`}
            >
              ×
            </button>
          )}
        </span>
      ))}
      <input
        id={id}
        type={inputType}
        value={draft}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value
          if (v.endsWith(',') || v.endsWith(' ')) commit(v)
          else setDraft(v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Tab') {
            if (draft) {
              e.preventDefault()
              commit(draft)
            }
          } else if (e.key === 'Backspace' && draft === '' && values.length) {
            setValues(values.slice(0, -1))
          }
        }}
        onBlur={() => commit(draft)}
        placeholder={values.length ? '' : placeholder}
        className="flex-1 min-w-[140px] bg-transparent font-garamond text-[0.95rem] text-ink placeholder:text-ink-subtle outline-none"
      />
    </div>
  )
}
