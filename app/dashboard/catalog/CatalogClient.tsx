'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { api } from '@/lib/api'
import { formatCents } from '@/lib/format'
import { PageHeader } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import { Input } from '@/components/ui/Input'
import EmptyState from '@/components/ui/EmptyState'
import AddToProjectModal from './AddToProjectModal'
import ImageSearchModal, { type ImageSearchResult } from './ImageSearchModal'
import type { CatalogProduct } from '@/lib/types-ui'

type Tab = 'library' | 'master'

export default function CatalogClient({
  initialLibrary,
}: {
  initialLibrary: CatalogProduct[]
}) {
  const [tab, setTab] = useState<Tab>('library')
  const [q, setQ] = useState('')
  const [results, setResults] = useState<CatalogProduct[] | null>(initialLibrary)
  const [picking, setPicking] = useState<CatalogProduct | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [imageSearchOpen, setImageSearchOpen] = useState(false)
  // When non-null, the grid is showing image-search results and the text
  // search is suspended until the user clears it.
  const [imageSearch, setImageSearch] = useState<ImageSearchResult | null>(null)

  useEffect(() => {
    if (imageSearch) return
    if (!hydrated && tab === 'library' && q === '') {
      setHydrated(true)
      return
    }
    setResults(null)
    const t = setTimeout(() => {
      const url =
        tab === 'library'
          ? `/api/catalog/library${q ? `?q=${encodeURIComponent(q)}` : ''}`
          : `/api/catalog${q ? `?q=${encodeURIComponent(q)}` : ''}`
      api.get<CatalogProduct[]>(url).then((r) => {
        setResults((r.data as CatalogProduct[]) ?? [])
      })
    }, 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, q, imageSearch])

  const onImageResults = (r: ImageSearchResult) => {
    setImageSearch(r)
    setResults(r.results)
    setQ('')
  }

  const clearImageSearch = () => {
    setImageSearch(null)
    setResults(null) // triggers the effect to reload normal results
  }

  const onSwitchTab = (k: Tab) => {
    if (imageSearch) clearImageSearch()
    setTab(k)
  }

  return (
    <div className="max-w-6xl">
      <PageHeader
        eyebrow="Catalog"
        title="Sourcing library"
        subtitle="Your library is what you've already added to projects. The master catalog is everything every studio has clipped — anonymized."
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex gap-px bg-hm-text/10 rounded-sm overflow-hidden">
          {(
            [
              ['library', 'My Library'],
              ['master', 'Master Catalog'],
            ] as Array<[Tab, string]>
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => onSwitchTab(k)}
              className={[
                'font-sans text-[10px] uppercase tracking-[0.22em] px-5 py-2.5 transition-colors',
                tab === k
                  ? 'bg-hm-text text-bg'
                  : 'bg-bg text-hm-nav hover:text-hm-text',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 sm:max-w-md w-full">
          <Input
            placeholder={
              tab === 'library'
                ? 'Search your library…'
                : 'Search the master catalog…'
            }
            value={q}
            onChange={(e) => {
              if (imageSearch) clearImageSearch()
              setQ(e.target.value)
            }}
            className="flex-1"
          />
          {tab === 'master' ? (
            <button
              type="button"
              onClick={() => setImageSearchOpen(true)}
              title="Search by image"
              aria-label="Search by image"
              className="border border-hm-text/15 px-3 hover:border-hm-text/40 hover:bg-hm-text/[0.03] transition-colors shrink-0"
            >
              <CameraIcon />
            </button>
          ) : null}
        </div>
      </div>

      {imageSearch ? (
        <div className="mb-5 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4 pb-4 border-b border-hm-text/10">
          <div className="flex-1 min-w-0">
            <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-1">
              Showing results for
            </div>
            <div className="font-garamond text-[0.95rem] text-hm-text">
              {imageSearch.query_description}
            </div>
          </div>
          <button
            onClick={clearImageSearch}
            className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav hover:text-hm-text whitespace-nowrap"
          >
            Clear image search
          </button>
        </div>
      ) : null}

      {results === null ? (
        <PageSpinner />
      ) : results.length === 0 ? (
        <EmptyState
          title={
            imageSearch
              ? 'No similar products found'
              : tab === 'library'
                ? 'Library is empty'
                : 'No catalog products yet'
          }
          body={
            imageSearch
              ? 'Try a different image or use text search.'
              : tab === 'library'
                ? 'As you add items to projects, they show up here for easy reuse.'
                : 'The platform-wide catalog grows as designers across hejmae source items. Add your first item to seed it.'
          }
          small
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => setPicking(p)}
              className="text-left border border-hm-text/10 p-3 hover:bg-hm-text/[0.03] transition-colors group"
            >
              <div className="aspect-square bg-hm-text/[0.05] mb-2.5 relative overflow-hidden">
                {p.image_url ? (
                  <Image
                    src={p.image_url}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 20vw, (min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw"
                    className="object-cover"
                    unoptimized
                  />
                ) : null}
                <div className="absolute inset-0 bg-hm-text/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-bg">
                    + Add to project
                  </span>
                </div>
              </div>
              <div className="font-garamond text-[0.95rem] leading-tight line-clamp-2">
                {p.name}
              </div>
              <div className="font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav mt-2">
                {p.vendor ?? '—'}
              </div>
              {p.retail_price_cents != null ? (
                <div className="font-garamond text-[0.85rem] text-hm-nav mt-0.5">
                  {formatCents(p.retail_price_cents)}
                </div>
              ) : null}
            </button>
          ))}
        </div>
      )}

      <AddToProjectModal
        open={picking !== null}
        onClose={() => setPicking(null)}
        product={picking}
      />
      <ImageSearchModal
        open={imageSearchOpen}
        onClose={() => setImageSearchOpen(false)}
        onResults={onImageResults}
      />
    </div>
  )
}

function CameraIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7.5h3.5l1.5-2h8l1.5 2H21v12H3z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  )
}
