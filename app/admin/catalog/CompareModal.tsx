'use client'

import { useState } from 'react'
import Image from 'next/image'
import Modal from '@/components/ui/Modal'
import { api, ApiError } from '@/lib/api'
import { formatCents } from '@/lib/format'
import { toast } from '@/components/ui/Toast'
import type { AdminCatalogRow } from '@/lib/admin/catalog'

// Side-by-side view of two products with three ways out:
//   * Flag as duplicate — queues a manual flag, no merge
//   * Merge now — flags + merges in the same flow (skip the queue)
//   * Not duplicates — close the modal, no flag

export default function CompareModal({
  open,
  pair,
  onClose,
  onResolved,
}: {
  open: boolean
  pair: [AdminCatalogRow, AdminCatalogRow] | null
  onClose: () => void
  onResolved: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [keepId, setKeepId] = useState<string | null>(null)
  const [showMergeChooser, setShowMergeChooser] = useState(false)

  if (!pair) return null
  const [a, b] = pair

  const handleFlagOnly = async () => {
    setBusy(true)
    try {
      await api.post('/api/admin/catalog/flag-duplicate', {
        product_a_id: a.id,
        product_b_id: b.id,
      })
      toast.success('Flagged for review')
      onResolved()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Flag failed')
    } finally {
      setBusy(false)
    }
  }

  const handleMergeNow = async () => {
    if (!keepId) {
      setShowMergeChooser(true)
      return
    }
    const removeId = keepId === a.id ? b.id : a.id
    setBusy(true)
    try {
      // Flag first so we have a row to merge against. If a flag exists,
      // the route returns the existing flag_id.
      const flagRes = await api.post<{ flag_id: string }>(
        '/api/admin/catalog/flag-duplicate',
        { product_a_id: a.id, product_b_id: b.id },
      )
      const flagId = (flagRes.data as { flag_id: string } | undefined)?.flag_id
      if (!flagId) throw new Error('No flag id returned')

      await api.post(`/api/admin/duplicates/${flagId}/merge`, {
        keep_product_id: keepId,
        remove_product_id: removeId,
      })
      const keptName = keepId === a.id ? a.name : b.name
      toast.success(`Merged into ${keptName}`)
      onResolved()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Merge failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Compare products" size="xl">
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        {[a, b].map((p, idx) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setKeepId(p.id)
              setShowMergeChooser(true)
            }}
            className={[
              'text-left border p-4 transition-colors',
              keepId === p.id
                ? 'border-ink bg-ink/[0.04]'
                : 'border-line hover:border-line-strong',
            ].join(' ')}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted">
                Product {idx === 0 ? 'A' : 'B'}
              </span>
              {showMergeChooser ? (
                <span
                  className={[
                    'font-sans text-[10px] uppercase tracking-[0.22em]',
                    keepId === p.id ? 'text-ink' : 'text-ink-subtle',
                  ].join(' ')}
                >
                  {keepId === p.id ? '✓ Keep' : 'Click to keep'}
                </span>
              ) : null}
            </div>
            <div className="flex gap-3">
              <div className="w-24 h-24 bg-ink/[0.05] relative shrink-0 overflow-hidden">
                {p.image_url ? (
                  <Image
                    src={p.image_url}
                    alt=""
                    fill
                    sizes="96px"
                    className="object-cover"
                    unoptimized
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-garamond text-[1rem] leading-tight line-clamp-2 mb-1">
                  {p.name}
                </div>
                <div className="font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted mb-1">
                  {p.vendor ?? '—'}
                </div>
                <div className="font-garamond text-[0.9rem] text-ink-muted mb-1">
                  {p.retail_price_cents != null
                    ? formatCents(p.retail_price_cents)
                    : 'No price'}
                  {' · '}
                  {p.clipped_count} clip{p.clipped_count === 1 ? '' : 's'}
                </div>
                {p.description ? (
                  <div className="font-garamond text-[0.85rem] text-ink-muted line-clamp-3">
                    {p.description}
                  </div>
                ) : null}
                {p.source_url ? (
                  <a
                    href={p.source_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 inline-block font-sans text-[10px] uppercase tracking-[0.2em] text-ink-muted hover:text-ink"
                  >
                    Source ↗
                  </a>
                ) : null}
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          onClick={onClose}
          className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted hover:text-ink px-4 py-2"
        >
          Not duplicates
        </button>
        <button
          onClick={handleFlagOnly}
          disabled={busy}
          className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted hover:text-ink border border-line hover:border-line-strong px-4 py-2 disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Flag for review'}
        </button>
        <button
          onClick={handleMergeNow}
          disabled={busy || (showMergeChooser && !keepId)}
          className="font-sans text-[10px] uppercase tracking-[0.22em] bg-ink text-bg hover:bg-ink/90 px-4 py-2 disabled:opacity-50"
        >
          {showMergeChooser
            ? keepId
              ? 'Confirm merge'
              : 'Choose product to keep'
            : 'Merge now'}
        </button>
      </div>
    </Modal>
  )
}
