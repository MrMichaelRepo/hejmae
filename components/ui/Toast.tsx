'use client'

// Tiny global toast. Call toast.success / toast.error / toast.info from
// anywhere; optional `action` adds a single button (e.g. Undo). One mount
// per app via <ToastHost /> in the root layout.

import { useEffect, useState } from 'react'

type ToastKind = 'success' | 'error' | 'info'

interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastOptions {
  action?: ToastAction
  durationMs?: number
}

interface ToastItem extends ToastOptions {
  id: number
  kind: ToastKind
  message: string
}

let listeners: Array<(t: ToastItem) => void> = []
let nextId = 1

function emit(kind: ToastKind, message: string, opts?: ToastOptions) {
  const t: ToastItem = { id: nextId++, kind, message, ...opts }
  listeners.forEach((fn) => fn(t))
}

export const toast = {
  success: (m: string, opts?: ToastOptions) => emit('success', m, opts),
  error: (m: string, opts?: ToastOptions) => emit('error', m, opts),
  info: (m: string, opts?: ToastOptions) => emit('info', m, opts),
}

const TONE: Record<ToastKind, string> = {
  success: 'border-success/40 bg-success-soft/60 text-ink',
  error: 'border-danger/40 bg-danger-soft/60 text-ink',
  info: 'border-line bg-bg-elevated text-ink',
}

function IconFor({ kind }: { kind: ToastKind }) {
  if (kind === 'success') {
    return (
      <svg viewBox="0 0 20 20" className="w-4 h-4 text-success shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 10.5l4 4 8-9" />
      </svg>
    )
  }
  if (kind === 'error') {
    return (
      <svg viewBox="0 0 20 20" className="w-4 h-4 text-danger shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10" cy="10" r="7.5" />
        <path d="M10 6.5v4M10 13.5v.01" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 text-ink-muted shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9.5v4.5M10 6.5v.01" />
    </svg>
  )
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])
  useEffect(() => {
    const fn = (t: ToastItem) => {
      setItems((s) => [...s, t])
      setTimeout(
        () => setItems((s) => s.filter((x) => x.id !== t.id)),
        t.durationMs ?? 4500,
      )
    }
    listeners.push(fn)
    return () => {
      listeners = listeners.filter((x) => x !== fn)
    }
  }, [])
  const dismiss = (id: number) => setItems((s) => s.filter((x) => x.id !== id))
  if (!items.length) return null
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          className={[
            'pointer-events-auto flex items-start gap-3 pl-4 pr-3 py-3 rounded-sm border shadow-elev1 max-w-sm font-garamond text-[0.95rem] leading-snug animate-sheet-in',
            TONE[t.kind],
          ].join(' ')}
        >
          <span className="pt-0.5">
            <IconFor kind={t.kind} />
          </span>
          <span className="flex-1 min-w-0">{t.message}</span>
          {t.action ? (
            <button
              type="button"
              onClick={() => {
                t.action!.onClick()
                dismiss(t.id)
              }}
              className="font-sans text-[10px] uppercase tracking-[0.2em] text-ink hover:text-accent transition-colors shrink-0"
            >
              {t.action.label}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="text-ink-subtle hover:text-ink transition-colors shrink-0 ml-1 -mt-0.5"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
