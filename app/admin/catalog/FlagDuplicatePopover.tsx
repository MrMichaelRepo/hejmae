'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Modal from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { api, ApiError } from '@/lib/api'
import { formatCents } from '@/lib/format'
import { toast } from '@/components/ui/Toast'
import type { AdminCatalogRow, AdminCatalogResult } from '@/lib/admin/catalog'

// Single-source row → manually flag against a chosen sibling.
// We render it as a small modal (not a true popover) for simplicity and
// because the search results need vertical space.

export default function FlagDuplicatePopover({
  open,
  product,
  onClose,
}: {
  open: boolean
  product: AdminCatalogRow | null
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<AdminCatalogRow[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setQ('')
      setResults([])
    }
  }, [open])

  useEffect(() => {
    if (!open || !product) return
    if (!q.trim()) {
      setResults([])
      return
    }
    let cancelled = false
    setLoading(true)
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await api.get<AdminCatalogResult>(
            `/api/admin/catalog?q=${encodeURIComponent(q.trim())}&limit=10`,
          )
          if (cancelled) return
          const list = (res.data as AdminCatalogResult | undefined)?.items ?? []
          setResults(list.filter((r) => r.id !== product.id))
        } catch (err) {
          if (!cancelled) {
            toast.error(err instanceof ApiError ? err.message : 'Search failed')
          }
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [q, open, product])

  if (!product) return null

  const flagAgainst = async (other: AdminCatalogRow) => {
    setSubmitting(true)
    try {
      const res = await api.post<{ flag_id: string; message: string }>(
        '/api/admin/catalog/flag-duplicate',
        { product_a_id: product.id, product_b_id: other.id },
      )
      const msg = (res.data as { message?: string } | undefined)?.message
      toast.success(
        msg === 'already_flagged' ? 'Already in the queue' : 'Flagged for review',
      )
      onClose()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Flag failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Flag as duplicate" size="md">
      <div className="border border-hm-text/10 p-3 mb-4 flex gap-3 items-center">
        <div className="w-12 h-12 bg-hm-text/[0.05] relative shrink-0 overflow-hidden">
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt=""
              fill
              sizes="48px"
              className="object-cover"
              unoptimized
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-garamond text-[0.95rem] line-clamp-1">
            {product.name}
          </div>
          <div className="font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav">
            {product.vendor ?? '—'}
          </div>
        </div>
      </div>

      <Input
        autoFocus
        placeholder="Search the other product…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="mt-3 max-h-72 overflow-y-auto">
        {loading ? (
          <div className="font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav py-4 text-center">
            Searching…
          </div>
        ) : results.length === 0 ? (
          <div className="font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav/60 py-4 text-center">
            {q.trim() ? 'No matches' : 'Type to search'}
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-hm-text/10">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  disabled={submitting}
                  onClick={() => flagAgainst(r)}
                  className="w-full text-left flex gap-3 items-center py-2.5 px-1 hover:bg-hm-text/[0.03] disabled:opacity-50"
                >
                  <div className="w-10 h-10 bg-hm-text/[0.05] relative shrink-0 overflow-hidden">
                    {r.image_url ? (
                      <Image
                        src={r.image_url}
                        alt=""
                        fill
                        sizes="40px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-garamond text-[0.95rem] line-clamp-1">
                      {r.name}
                    </div>
                    <div className="font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav">
                      {r.vendor ?? '—'}
                      {r.retail_price_cents != null
                        ? ` · ${formatCents(r.retail_price_cents)}`
                        : ''}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
