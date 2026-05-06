'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Button from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import { Drawer } from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'
import ImageUploader from '@/components/ui/ImageUploader'
import type { Item, Room, ItemStatus, Vendor } from '@/lib/types-ui'

const STATUSES: ItemStatus[] = [
  'sourcing',
  'approved',
  'ordered',
  'received',
  'installed',
]

export default function EditItemDrawer({
  open,
  onClose,
  projectId,
  item,
  rooms,
  onSaved,
  onDeleted,
}: {
  open: boolean
  onClose: () => void
  projectId: string
  item: Item | null
  rooms: Room[]
  onSaved: () => void
  onDeleted: () => void
}) {
  const [name, setName] = useState('')
  const [vendor, setVendor] = useState('')
  const [room, setRoom] = useState('')
  const [trade, setTrade] = useState('')
  const [retail, setRetail] = useState('')
  const [qty, setQty] = useState(1)
  const [status, setStatus] = useState<ItemStatus>('sourcing')
  const [imageUrl, setImageUrl] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [vendors, setVendors] = useState<Vendor[]>([])

  // Fetch vendors lazily on first drawer open. Per-designer count is
  // small (tens, not thousands), so we cache the full list and look up
  // by name client-side.
  useEffect(() => {
    if (!open || vendors.length > 0) return
    api
      .get<Vendor[]>('/api/vendors')
      .then((r) => setVendors((r.data as Vendor[]) ?? []))
      .catch(() => {})
  }, [open, vendors.length])

  useEffect(() => {
    if (item) {
      setName(item.name)
      setVendor(item.vendor ?? '')
      setRoom(item.room_id ?? '')
      setTrade(String(item.trade_price_cents / 100))
      setRetail(item.retail_price_cents != null ? String(item.retail_price_cents / 100) : '')
      setQty(item.quantity)
      setStatus(item.status)
      setImageUrl(item.image_url ?? '')
      setSourceUrl(item.source_url ?? '')
      setNotes(item.notes ?? '')
    }
  }, [item])

  if (!item) return null

  // Look up the vendor record matching the typed vendor name. Returns
  // the row or null. Case-insensitive exact match — same logic as the
  // backend so what the user sees is what the server will compute.
  const matchedVendor = vendor.trim()
    ? vendors.find(
        (v) => v.name.toLowerCase() === vendor.trim().toLowerCase(),
      ) ?? null
    : null

  // Suggested trade dollars given the matched vendor + retail entered.
  const retailCents = retail ? Math.round(Number(retail) * 100) : null
  const suggestedTradeDollars = (() => {
    if (!matchedVendor || retailCents == null) return null
    const pct = Number(matchedVendor.trade_discount_percent)
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return null
    return ((retailCents * (1 - pct / 100)) / 100).toFixed(2)
  })()

  const save = async () => {
    setSaving(true)
    try {
      await api.patch(`/api/projects/${projectId}/items/${item.id}`, {
        name: name.trim(),
        vendor: vendor.trim() || null,
        room_id: room || null,
        trade_price_cents: Math.round(Number(trade || 0) * 100),
        retail_price_cents: retail
          ? Math.round(Number(retail) * 100)
          : null,
        quantity: qty,
        status,
        image_url: imageUrl.trim() || null,
        source_url: sourceUrl.trim() || null,
        notes: notes.trim() || null,
      })
      onSaved()
      toast.success('Item updated')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm('Delete this item?')) return
    setDeleting(true)
    try {
      await api.del(`/api/projects/${projectId}/items/${item.id}`)
      onDeleted()
      toast.success('Item deleted')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Edit item" width={560}>
      <ImageUploader
        value={imageUrl || null}
        onChange={(v) => setImageUrl(v ?? '')}
        projectId={projectId}
        ownerId={item.id}
      />

      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Vendor">
        <Input value={vendor} onChange={(e) => setVendor(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Room">
          <Select value={room} onChange={(e) => setRoom(e.target.value)}>
            <option value="">No room</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as ItemStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Trade">
          <Input
            value={trade}
            onChange={(e) => setTrade(e.target.value)}
            inputMode="decimal"
          />
        </Field>
        <Field label="Retail">
          <Input
            value={retail}
            onChange={(e) => setRetail(e.target.value)}
            inputMode="decimal"
          />
        </Field>
        <Field label="Qty">
          <Input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value) || 1)}
          />
        </Field>
      </div>
      {suggestedTradeDollars && trade !== suggestedTradeDollars ? (
        <div className="-mt-3 mb-5 flex items-center justify-between gap-3 px-3 py-2 border border-hm-text/10 bg-hm-text/[0.03]">
          <div className="font-garamond text-[0.9rem] text-hm-nav">
            {matchedVendor?.name} trade ({Number(matchedVendor?.trade_discount_percent)}% off): ${suggestedTradeDollars}
          </div>
          <button
            type="button"
            onClick={() => setTrade(suggestedTradeDollars)}
            className="font-sans text-[10px] uppercase tracking-[0.18em] text-hm-text hover:underline"
          >
            Apply
          </button>
        </div>
      ) : null}
      <Field label="Source URL">
        <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
      </Field>
      <Field label="Notes">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </Field>

      <div className="flex justify-between gap-3 pt-2 border-t border-hm-text/10 mt-2">
        <Button variant="danger" onClick={remove} loading={deleting}>
          Delete
        </Button>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            Save
          </Button>
        </div>
      </div>
    </Drawer>
  )
}
