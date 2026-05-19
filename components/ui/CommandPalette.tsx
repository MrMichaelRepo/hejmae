'use client'

import { Command } from 'cmdk'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, createContext, useContext, useRef } from 'react'
import { createPortal } from 'react-dom'
import { api } from '@/lib/api'

type PaletteCtx = { open: () => void; close: () => void; toggle: () => void }
const Ctx = createContext<PaletteCtx | null>(null)

export function useCommandPalette() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCommandPalette must be used inside <CommandPaletteProvider>')
  return ctx
}

interface SearchHit {
  id: string
  name: string
  subtitle?: string
}

interface SearchResults {
  projects: Array<{ id: string; name: string; location: string | null; status: string }>
  clients: Array<{ id: string; name: string; email: string | null }>
  vendors: Array<{ id: string; name: string }>
  catalog_products: Array<{ id: string; name: string; brand: string | null }>
}

const EMPTY_RESULTS: SearchResults = {
  projects: [],
  clients: [],
  vendors: [],
  catalog_products: [],
}

/**
 * Global ⌘K palette. Mount once near the root of any authenticated layout.
 * Quick actions and route jumps are static; project/client/vendor/catalog
 * lookups hit /api/search/quick with a 200ms debounce.
 */
export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

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

  const ctx: PaletteCtx = {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen((v) => !v),
  }

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
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS)
  const [searching, setSearching] = useState(false)
  const reqId = useRef(0)

  // Debounced fetch — fires 180ms after the user stops typing.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults(EMPTY_RESULTS)
      setSearching(false)
      return
    }
    setSearching(true)
    const myId = ++reqId.current
    const handle = setTimeout(() => {
      api
        .get<SearchResults>(`/api/search/quick?q=${encodeURIComponent(q)}`)
        .then((res) => {
          if (myId !== reqId.current) return // stale
          setResults((res.data as SearchResults) ?? EMPTY_RESULTS)
        })
        .catch(() => {
          if (myId !== reqId.current) return
          setResults(EMPTY_RESULTS)
        })
        .finally(() => {
          if (myId === reqId.current) setSearching(false)
        })
    }, 180)
    return () => clearTimeout(handle)
  }, [query])

  const hasResults =
    results.projects.length > 0 ||
    results.clients.length > 0 ||
    results.vendors.length > 0 ||
    results.catalog_products.length > 0
  const showSearch = query.trim().length >= 2

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
        <Command label="Command Menu" shouldFilter={!showSearch}>
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Jump to a page, create something, or search…"
            autoFocus
          />
          <Command.List>
            <Command.Empty>
              {searching ? 'Searching…' : 'No matches. Try a different search.'}
            </Command.Empty>

            {showSearch && hasResults ? (
              <>
                {results.projects.length > 0 ? (
                  <Command.Group heading="Projects">
                    {results.projects.map((p) => (
                      <Command.Item
                        key={`p-${p.id}`}
                        value={`project ${p.name} ${p.location ?? ''}`}
                        onSelect={() => go(`/dashboard/projects/${p.id}`)}
                      >
                        <span className="truncate">{p.name}</span>
                        {p.location ? (
                          <span className="ml-2 text-ink-subtle truncate">{p.location}</span>
                        ) : null}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ) : null}

                {results.clients.length > 0 ? (
                  <Command.Group heading="Clients">
                    {results.clients.map((c) => (
                      <Command.Item
                        key={`c-${c.id}`}
                        value={`client ${c.name} ${c.email ?? ''}`}
                        onSelect={() => go(`/dashboard/clients/${c.id}`)}
                      >
                        <span className="truncate">{c.name}</span>
                        {c.email ? (
                          <span className="ml-2 text-ink-subtle truncate">{c.email}</span>
                        ) : null}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ) : null}

                {results.vendors.length > 0 ? (
                  <Command.Group heading="Vendors">
                    {results.vendors.map((v) => (
                      <Command.Item
                        key={`v-${v.id}`}
                        value={`vendor ${v.name}`}
                        onSelect={() => go(`/dashboard/vendors?focus=${v.id}`)}
                      >
                        <span className="truncate">{v.name}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                ) : null}

                {results.catalog_products.length > 0 ? (
                  <Command.Group heading="Catalog">
                    {results.catalog_products.map((c) => (
                      <Command.Item
                        key={`cat-${c.id}`}
                        value={`catalog ${c.name} ${c.brand ?? ''}`}
                        onSelect={() => go(`/dashboard/catalog?focus=${c.id}`)}
                      >
                        <span className="truncate">{c.name}</span>
                        {c.brand ? (
                          <span className="ml-2 text-ink-subtle truncate">{c.brand}</span>
                        ) : null}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ) : null}
              </>
            ) : null}

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
