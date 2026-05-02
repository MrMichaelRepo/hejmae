'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatCents } from '@/lib/format'
import { PageHeader } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import { Input } from '@/components/ui/Input'
import EmptyState from '@/components/ui/EmptyState'
import type { CatalogProduct } from '@/lib/types-ui'

export default function CatalogPage() {
  const [tab, setTab] = useState<'library' | 'master'>('library')
  const [q, setQ] = useState('')
  const [results, setResults] = useState<CatalogProduct[] | null>(null)

  useEffect(() => {
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
  }, [tab, q])

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
            ] as Array<['library' | 'master', string]>
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
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
        <Input
          placeholder={
            tab === 'library'
              ? 'Search your library…'
              : 'Search the master catalog…'
          }
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="sm:max-w-md"
        />
      </div>

      {results === null ? (
        <PageSpinner />
      ) : results.length === 0 ? (
        <EmptyState
          title={
            tab === 'library' ? 'Library is empty' : 'No catalog products yet'
          }
          body={
            tab === 'library'
              ? 'As you add items to projects, they show up here for easy reuse.'
              : 'The platform-wide catalog grows as designers across hejmae source items. Add your first item to seed it.'
          }
          small
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {results.map((p) => (
            <a
              key={p.id}
              href={p.source_url ?? '#'}
              target={p.source_url ? '_blank' : undefined}
              rel="noreferrer"
              className="border border-hm-text/10 p-3 hover:bg-hm-text/[0.03] transition-colors"
            >
              <div className="aspect-square bg-hm-text/[0.05] mb-2.5">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : null}
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
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
