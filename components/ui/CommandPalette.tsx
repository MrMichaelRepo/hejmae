'use client'

import { Command } from 'cmdk'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, createContext, useContext } from 'react'
import { createPortal } from 'react-dom'

type PaletteCtx = { open: () => void; close: () => void; toggle: () => void }
const Ctx = createContext<PaletteCtx | null>(null)

export function useCommandPalette() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCommandPalette must be used inside <CommandPaletteProvider>')
  return ctx
}

/**
 * Global ⌘K palette. Mount once near the root of any authenticated layout.
 * Quick actions and route jumps are statically wired; project/client/vendor
 * fuzzy search will hit /api/search/quick once that endpoint exists.
 */
export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const ctx: PaletteCtx = {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen((v) => !v),
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const go = useCallback(
    (href: string) => {
      setOpen(false)
      router.push(href)
    },
    [router],
  )

  return (
    <Ctx.Provider value={ctx}>
      {children}
      {open && typeof window !== 'undefined'
        ? createPortal(<Palette onClose={() => setOpen(false)} go={go} />, document.body)
        : null}
    </Ctx.Provider>
  )
}

function Palette({ onClose, go }: { onClose: () => void; go: (href: string) => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[14vh] px-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-ink/30 animate-backdrop-in" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl bg-bg-elevated border border-line rounded-lg shadow-elev2 overflow-hidden animate-sheet-in"
      >
        <Command label="Command Menu">
          <Command.Input placeholder="Jump to a page, create something, or search…" autoFocus />
          <Command.List>
            <Command.Empty>No matches. Try a different search.</Command.Empty>

            <Command.Group heading="Create">
              <Command.Item onSelect={() => go('/dashboard/projects?new=1')}>
                New project <kbd>P</kbd>
              </Command.Item>
              <Command.Item onSelect={() => go('/dashboard/clients?new=1')}>
                New client <kbd>C</kbd>
              </Command.Item>
              <Command.Item onSelect={() => go('/dashboard/vendors?new=1')}>
                New vendor
              </Command.Item>
              <Command.Item onSelect={() => go('/dashboard/clippings?new=1')}>
                New clipping
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Go to">
              <Command.Item onSelect={() => go('/dashboard')}>
                Overview
              </Command.Item>
              <Command.Item onSelect={() => go('/dashboard/projects')}>
                Projects
              </Command.Item>
              <Command.Item onSelect={() => go('/dashboard/time')}>
                Time
              </Command.Item>
              <Command.Item onSelect={() => go('/dashboard/catalog')}>
                Catalog
              </Command.Item>
              <Command.Item onSelect={() => go('/dashboard/clippings')}>
                Clippings
              </Command.Item>
              <Command.Item onSelect={() => go('/dashboard/vendors')}>
                Vendors
              </Command.Item>
              <Command.Item onSelect={() => go('/dashboard/clients')}>
                Clients
              </Command.Item>
              <Command.Item onSelect={() => go('/dashboard/finances')}>
                Finances
              </Command.Item>
              <Command.Item onSelect={() => go('/dashboard/settings')}>
                Settings
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  )
}

/** Compact "⌘K" pill — drop into sidebars or headers. */
export function CommandPaletteTrigger({ className = '' }: { className?: string }) {
  const { open } = useCommandPalette()
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
  return (
    <button
      type="button"
      onClick={open}
      className={[
        'group flex items-center gap-3 w-full px-3 py-2 rounded border border-line bg-surface hover:bg-accent-soft/40 transition-colors duration-150 ease-out-soft focus-ring',
        className,
      ].join(' ')}
    >
      <span className="font-sans text-[10px] uppercase tracking-[0.2em] text-ink-subtle group-hover:text-ink-muted">
        Quick find
      </span>
      <span className="ml-auto font-sans text-[10px] tracking-wider text-ink-subtle bg-ink/[0.04] rounded px-1.5 py-0.5">
        {isMac ? '⌘K' : 'Ctrl K'}
      </span>
    </button>
  )
}
