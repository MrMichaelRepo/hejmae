'use client'

import { createContext, useContext, useEffect, useState } from 'react'

export type Density = 'compact' | 'comfortable' | 'spacious'

const STORAGE_KEY = 'hejmae:density'

type Ctx = { density: Density; setDensity: (d: Density) => void }
const DensityCtx = createContext<Ctx | null>(null)

export function DensityProvider({ children }: { children: React.ReactNode }) {
  // Render the server / first client paint with "comfortable" to keep
  // hydration stable, then read localStorage in an effect.
  const [density, setDensityState] = useState<Density>('comfortable')

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY)
      if (v === 'compact' || v === 'comfortable' || v === 'spacious') {
        setDensityState(v)
      }
    } catch {}
  }, [])

  const setDensity = (d: Density) => {
    setDensityState(d)
    try {
      window.localStorage.setItem(STORAGE_KEY, d)
    } catch {}
  }

  return <DensityCtx.Provider value={{ density, setDensity }}>{children}</DensityCtx.Provider>
}

export function useDensity(): Ctx {
  const ctx = useContext(DensityCtx)
  if (!ctx) {
    // Soft fallback so components don't crash on pages that haven't
    // mounted the provider (e.g. marketing/portal routes).
    return { density: 'comfortable', setDensity: () => {} }
  }
  return ctx
}

/**
 * Tailwind class snippets for table-like rows, keyed by density.
 * Use as:  `<div className={cn('grid', rowClass(density))} ...>`
 */
export const rowClass = (d: Density) =>
  d === 'compact'
    ? 'py-2 text-[0.92rem]'
    : d === 'spacious'
    ? 'py-5 text-[1.02rem]'
    : 'py-4 text-[1rem]'

export const cardGapClass = (d: Density) =>
  d === 'compact' ? 'gap-3' : d === 'spacious' ? 'gap-7' : 'gap-5'

/** Three-button segmented control. Drop into Settings or a toolbar. */
export function DensityToggle({ className = '' }: { className?: string }) {
  const { density, setDensity } = useDensity()
  const opts: Array<{ value: Density; label: string }> = [
    { value: 'compact', label: 'Compact' },
    { value: 'comfortable', label: 'Comfortable' },
    { value: 'spacious', label: 'Spacious' },
  ]
  return (
    <div
      className={[
        'inline-flex gap-px bg-line rounded-sm overflow-hidden border border-line',
        className,
      ].join(' ')}
      role="radiogroup"
      aria-label="Row density"
    >
      {opts.map((o) => {
        const active = density === o.value
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => setDensity(o.value)}
            className={[
              'font-sans text-[10px] uppercase tracking-[0.2em] px-4 py-2 transition-colors duration-150 ease-out-soft focus-ring',
              active
                ? 'bg-ink text-bg'
                : 'bg-bg text-ink-muted hover:text-ink',
            ].join(' ')}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
