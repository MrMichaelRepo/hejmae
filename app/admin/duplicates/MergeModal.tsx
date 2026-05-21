'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Modal from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Input'
import SelectableCard from '@/components/ui/SelectableCard'
import { api, ApiError } from '@/lib/api'
import { formatCents } from '@/lib/format'
import { toast } from '@/components/ui/Toast'
import type { DuplicateFlagWithProducts } from '@/lib/admin/duplicates'

export default function MergeModal({
  open,
  row,
  onClose,
  onMerged,
}: {
  open: boolean
  row: DuplicateFlagWithProducts | null
  onClose: () => void
  onMerged: (flagId: string) => void
}) {
  const [keepId, setKeepId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open && row) {
      // Default: keep the product with more clippings; tie → A.
      const a = row.product_a
      const b = row.product_b
      if (a && b) {
        setKeepId(
          (a.clipped_count ?? 0) >= (b.clipped_count ?? 0) ? a.id : b.id,
        )
      } else if (a) {
        setKeepId(a.id)
      } else if (b) {
        setKeepId(b.id)
      }
      setNotes('')
    }
  }, [open, row])

  if (!row) return null

  const a = row.product_a
  const b = row.product_b

  const onConfirm = async () => {
    if (!keepId || !a || !b) return
    const removeId = keepId === a.id ? b.id : a.id
    setSubmitting(true)
    try {
      await api.post<{ kept_product_id: string }>(
        `/api/admin/duplicates/${row.flag.id}/merge`,
        {
          keep_product_id: keepId,
          remove_product_id: removeId,
          resolution_notes: notes.trim() ? notes.trim() : undefined,
        },
      )
      const keptName = (keepId === a.id ? a.name : b.name) ?? 'product'
      const removedName = (keepId === a.id ? b.name : a.name) ?? 'product'
      toast.success(`Merged. ${removedName} consolidated into ${keptName}.`)
      onMerged(row.flag.id)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Merge failed')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = keepId !== null && a !== null && b !== null && !submitting

  return (
    <Modal open={open} onClose={onClose} title="Confirm merge" size="xl">
      <p className="font-garamond text-[0.95rem] text-ink-muted leading-relaxed mb-5">
        Pick the product to keep. Items and clippings pointing at the other
        will be re-pointed to the kept product. The removed record is marked
        merged but not deleted — its history is preserved.
      </p>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        {[a, b].map((p, idx) =>
          p ? (
            <SelectableCard
              key={p.id}
              onClick={() => setKeepId(p.id)}
              selected={keepId === p.id}
              className="!p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted">
                  Product {idx === 0 ? 'A' : 'B'}
                </span>
                <span
                  className={[
                    'font-sans text-[10px] uppercase tracking-[0.22em]',
                    keepId === p.id ? 'text-ink' : 'text-ink-subtle',
                  ].join(' ')}
                >
                  {keepId === p.id ? '✓ Keep' : 'Click to keep'}
                </span>
              </div>
              <div className="flex gap-3">
                <div className="w-20 h-20 bg-ink/[0.05] relative shrink-0 overflow-hidden">
                  {p.image_url ? (
                    <Image
                      src={p.image_url}
                      alt=""
                      fill
                      sizes="80px"
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
                  <div className="font-garamond text-[0.9rem] text-ink-muted">
                    {p.retail_price_cents != null
                      ? formatCents(p.retail_price_cents)
                      : 'No price'}
                    {' · '}
                    {p.clipped_count} clip
                    {p.clipped_count === 1 ? '' : 's'}
                  </div>
                </div>
              </div>
            </SelectableCard>
          ) : (
            <div
              key={idx}
              className="border border-line rounded p-4 text-ink-muted font-garamond text-[0.95rem]"
            >
              Product missing.
            </div>
          ),
        )}
      </div>

      <div className="mb-6">
        <label className="block font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-2">
          Resolution notes (optional)
        </label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Why these are duplicates, anything to remember…"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted hover:text-ink border border-line hover:border-line-strong px-4 py-2"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canSubmit}
          className="font-sans text-[10px] uppercase tracking-[0.22em] bg-ink text-bg hover:bg-ink/90 px-4 py-2 disabled:opacity-50"
        >
          {submitting ? 'Merging…' : 'Confirm merge'}
        </button>
      </div>
    </Modal>
  )
}
