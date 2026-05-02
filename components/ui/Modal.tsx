'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open || typeof window === 'undefined') return null

  const widths: Record<string, string> = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-hm-text/30" />
      <div
        className={[
          'relative bg-bg border border-hm-text/15 shadow-2xl w-full',
          widths[size],
          'max-h-[90vh] overflow-y-auto',
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <div className="border-b border-hm-text/10 px-7 py-5 flex items-center justify-between">
            <div className="font-serif text-[1.2rem] leading-none">{title}</div>
            <button
              onClick={onClose}
              className="font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav hover:text-hm-text"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        ) : null}
        <div className="p-7">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  width = 480,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  width?: number
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open || typeof window === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-hm-text/30" />
      <div
        className="absolute right-0 top-0 bottom-0 bg-bg border-l border-hm-text/15 shadow-2xl flex flex-col"
        style={{ width: `min(${width}px, 100vw)` }}
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <div className="border-b border-hm-text/10 px-7 py-5 flex items-center justify-between shrink-0">
            <div className="font-serif text-[1.2rem] leading-none">{title}</div>
            <button
              onClick={onClose}
              className="font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav hover:text-hm-text"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        ) : null}
        <div className="flex-1 overflow-y-auto p-7">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
