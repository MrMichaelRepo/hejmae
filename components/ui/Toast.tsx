'use client'

// Tiny global toast. Call toast.success / toast.error from anywhere.
// One mount per app via <ToastHost /> in the root layout.
import { useEffect, useState } from 'react'

type ToastKind = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

let listeners: Array<(t: ToastItem) => void> = []
let nextId = 1

function emit(kind: ToastKind, message: string) {
  const t: ToastItem = { id: nextId++, kind, message }
  listeners.forEach((fn) => fn(t))
}

export const toast = {
  success: (m: string) => emit('success', m),
  error: (m: string) => emit('error', m),
  info: (m: string) => emit('info', m),
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])
  useEffect(() => {
    const fn = (t: ToastItem) => {
      setItems((s) => [...s, t])
      setTimeout(
        () => setItems((s) => s.filter((x) => x.id !== t.id)),
        4500,
      )
    }
    listeners.push(fn)
    return () => {
      listeners = listeners.filter((x) => x !== fn)
    }
  }, [])
  if (!items.length) return null
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          className={[
            'pointer-events-auto px-5 py-3 rounded-sm border shadow-lg max-w-sm font-garamond text-[0.95rem] leading-snug bg-bg',
            t.kind === 'success'
              ? 'border-emerald-700/30 text-emerald-900'
              : t.kind === 'error'
              ? 'border-red-700/30 text-red-900'
              : 'border-hm-text/20 text-hm-text',
          ].join(' ')}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
