'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { api } from '@/lib/api'
import { formatCents } from '@/lib/format'
import Button from '@/components/ui/Button'
import { Field, Input, Label, Select, Textarea } from '@/components/ui/Input'
import { Drawer } from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'
import ImageUploader from '@/components/ui/ImageUploader'
import type { CatalogProduct, Room } from '@/lib/types-ui'

interface Props {
  open: boolean
  onClose: () => void
  projectId: string
  rooms: Room[]
  onAdded: () => void
}

export default function AddItemDrawer({ open, onClose, projectId, rooms, onAdded }: Props) {
  const [tab, setTab] = useState<'search' | 'new'>('search')

  return (
    <Drawer open={open} onClose={onClose} title="Add item" width={560}>
      <div className="flex border border-hm-text/15 rounded-sm overflow-hidden mb-6">
        <button
          onClick={() => setTab('search')}
          className={[
            'flex-1 font-sans text-[10px] uppercase tracking-[0.22em] py-2.5 transition-colors',
            tab === 'search'
              ? 'bg-hm-text text-bg'
              : 'bg-bg text-hm-nav hover:text-hm-text',
          ].join(' ')}
        >
          Search catalog
        </button>
        <button
          onClick={() => setTab('new')}
          className={[
            'flex-1 font-sans text-[10px] uppercase tracking-[0.22em] py-2.5 transition-colors',
            tab === 'new'
              ? 'bg-hm-text text-bg'
              : 'bg-bg text-hm-nav hover:text-hm-text',
          ].join(' ')}
        >
          Add new
        </button>
      </div>

      {tab === 'search' ? (
        <CatalogSearch projectId={projectId} rooms={rooms} onAdded={onAdded} />
      ) : (
        <NewItemForm projectId={projectId} rooms={rooms} onAdded={onAdded} />
      )}
    </Drawer>
  )
}

function CatalogSearch({
  projectId,
  rooms,
  onAdded,
}: {
  projectId: string
  rooms: Room[]
  onAdded: () => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<CatalogProduct[]>([])
  const [picking, setPicking] = useState<CatalogProduct | null>(null)
  const [room, setRoom] = useState('')
  const [tradeStr, setTradeStr] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      const url = q
        ? `/api/catalog?q=${encodeURIComponent(q)}`
        : `/api/catalog/library`
      api.get<CatalogProduct[]>(url).then((r) => {
        setResults((r.data as CatalogProduct[]) ?? [])
      })
    }, 200)
    return () => clearTimeout(t)
  }, [q])

  const submit = async () => {
    if (!picking) return
    setSubmitting(true)
    try {
      const trade = Math.round(Number(tradeStr) * 100) || 0
      await api.post(`/api/projects/${projectId}/items`, {
        catalog_product_id: picking.id,
        name: picking.name,
        vendor: picking.vendor,
        image_url: picking.image_url,
        source_url: picking.source_url,
        retail_price_cents: picking.retail_price_cents,
        trade_price_cents: trade,
        room_id: room || null,
      })
      onAdded()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (picking) {
    return (
      <div>
        <button
          onClick={() => setPicking(null)}
          className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav hover:text-hm-text mb-4"
        >
          ← Back to search
        </button>
        <div className="flex gap-4 items-start mb-5 pb-5 border-b border-hm-text/10">
          <div className="w-20 h-20 bg-hm-text/[0.05] shrink-0 relative overflow-hidden">
            {picking.image_url ? (
              <Image
                src={picking.image_url}
                alt=""
                fill
                sizes="80px"
                className="object-cover"
                unoptimized
              />
            ) : null}
          </div>
          <div>
            <div className="font-serif text-[1.1rem] leading-tight">{picking.name}</div>
            <div className="font-garamond text-[0.9rem] text-hm-nav mt-1">
              {picking.vendor ?? 'Unknown vendor'}
            </div>
            {picking.retail_price_cents != null ? (
              <div className="font-garamond text-[0.9rem] text-hm-nav mt-1">
                Retail: {formatCents(picking.retail_price_cents)}
              </div>
            ) : null}
          </div>
        </div>

        <Field label="Your trade price (USD)">
          <Input
            value={tradeStr}
            onChange={(e) => setTradeStr(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
          />
        </Field>
        <Field label="Room">
          <Select value={room} onChange={(e) => setRoom(e.target.value)}>
            <option value="">No room yet</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex justify-end">
          <Button onClick={submit} loading={submitting} variant="primary">
            Add to project
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Input
        autoFocus
        placeholder="Search catalog…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-4"
      />
      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {results.length === 0 ? (
          <div className="font-garamond text-[0.95rem] text-hm-nav py-6 text-center">
            {q ? 'No results' : 'Start typing to search'}
          </div>
        ) : (
          results.map((r) => (
            <button
              key={r.id}
              onClick={() => setPicking(r)}
              className="w-full text-left border border-hm-text/10 px-3 py-3 flex gap-3 items-center hover:bg-hm-text/[0.03] transition-colors"
            >
              <div className="w-12 h-12 bg-hm-text/[0.05] shrink-0 relative overflow-hidden">
                {r.image_url ? (
                  <Image
                    src={r.image_url}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                    unoptimized
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-serif text-[1rem] leading-tight truncate">{r.name}</div>
                <div className="font-garamond text-[0.85rem] text-hm-nav truncate">
                  {r.vendor ?? 'Unknown'}
                  {r.retail_price_cents != null ? ` · ${formatCents(r.retail_price_cents)}` : ''}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function NewItemForm({
  projectId,
  rooms,
  onAdded,
}: {
  projectId: string
  rooms: Room[]
  onAdded: () => void
}) {
  const [name, setName] = useState('')
  const [vendor, setVendor] = useState('')
  const [room, setRoom] = useState('')
  const [trade, setTrade] = useState('')
  const [retail, setRetail] = useState('')
  const [qty, setQty] = useState(1)
  const [imageUrl, setImageUrl] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setErr(null)
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        vendor: vendor.trim() || null,
        image_url: imageUrl.trim() || null,
        source_url: sourceUrl.trim() || null,
        room_id: room || null,
        trade_price_cents: Math.round(Number(trade || 0) * 100),
        quantity: qty,
        notes: notes.trim() || null,
      }
      if (retail) body.retail_price_cents = Math.round(Number(retail) * 100)
      await api.post(`/api/projects/${projectId}/items`, body)
      onAdded()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <Field label="Name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
          placeholder="e.g. Linen sofa, Charcoal"
        />
      </Field>
      <Field label="Vendor">
        <Input
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          placeholder="e.g. Roll & Hill"
        />
      </Field>
      <Field label="Room">
        <Select value={room} onChange={(e) => setRoom(e.target.value)}>
          <option value="">No room yet</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Trade price">
          <Input
            value={trade}
            onChange={(e) => setTrade(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
          />
        </Field>
        <Field label="Retail price">
          <Input
            value={retail}
            onChange={(e) => setRetail(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
          />
        </Field>
        <Field label="Quantity">
          <Input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value) || 1)}
          />
        </Field>
      </div>
      <ImageUploader
        value={imageUrl || null}
        onChange={(v) => setImageUrl(v ?? '')}
        projectId={projectId}
        ownerId="new"
      />
      <Field label="Source URL">
        <Input
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://vendor.com/product"
        />
      </Field>
      <Field label="Notes">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Spec details, finish, lead time…"
        />
      </Field>

      {err ? (
        <div className="mb-4 border border-red-700/30 px-3 py-2 font-garamond text-[0.9rem] text-red-900">
          {err}
        </div>
      ) : (
        <div className="mb-4">
          <Label>Client price</Label>
          <div className="font-garamond text-[0.9rem] text-hm-nav">
            Calculated automatically using your project&apos;s pricing mode (retail or
            cost-plus). Trade pricing is private to you.
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={submitting}>
          Add item
        </Button>
      </div>
    </form>
  )
}
