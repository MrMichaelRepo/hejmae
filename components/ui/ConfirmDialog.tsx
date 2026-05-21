'use client'

// Async confirmation dialog backed by our Modal primitive.
// Usage:
//   const confirm = useConfirm()
//   if (await confirm({ title: 'Delete this item?', confirmLabel: 'Delete', tone: 'danger' })) { ... }

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import Modal from './Modal'
import Button from './Button'

export interface ConfirmOptions {
  title: string
  body?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'default'
}

type Resolver = (value: boolean) => void

const ConfirmCtx = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null)

export function useConfirm(): (o: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmCtx)
  if (!ctx) {
    // Fallback for surfaces not wrapped in the provider (shouldn't happen
    // in authenticated routes, but keeps storybook/tests sane).
    return async (o) =>
      typeof window !== 'undefined' ? window.confirm(o.title) : false
  }
  return ctx
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<Resolver | null>(null)

  const ask = useCallback((o: ConfirmOptions) => {
    setOpts(o)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
    })
  }, [])

  const resolve = (value: boolean) => {
    setOpen(false)
    const fn = resolverRef.current
    resolverRef.current = null
    if (fn) fn(value)
  }

  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Modal
        open={open}
        onClose={() => resolve(false)}
        title={opts?.title}
        size="sm"
      >
        {opts?.body ? (
          <div className="font-garamond text-[1rem] leading-[1.6] text-ink-muted mb-6">
            {opts.body}
          </div>
        ) : (
          <div className="mb-2" />
        )}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => resolve(false)}>
            {opts?.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            variant={opts?.tone === 'danger' ? 'danger' : 'primary'}
            onClick={() => resolve(true)}
            autoFocus
          >
            {opts?.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </Modal>
    </ConfirmCtx.Provider>
  )
}
