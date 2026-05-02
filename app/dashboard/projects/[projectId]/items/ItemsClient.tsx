'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { formatCents, titleCase } from '@/lib/format'
import { PageSpinner } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { Field, Input, Select, Textarea, Label } from '@/components/ui/Input'
import { Drawer } from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'
import { ManageRoomsButton } from '@/components/ui/RoomManager'
import EditItemDrawer from './EditItemDrawer'
import type { Item, Room, CatalogProduct, ItemStatus } from '@/lib/types-ui'

const STATUSES: ItemStatus[] = [
  'sourcing',
  'approved',
  'ordered',
  'received',
  'installed',
]

export default function ItemsClient({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams()
  const initialStatus = searchParams.get('status') ?? undefined
  const [items, setItems] = useState<Item[] | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [filter, setFilter] = useState<{ room?: string; status?: string }>(
    initialStatus ? { status: initialStatus } : {},
  )
  const [openAdd, setOpenAdd] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)

  const load = async () => {
    const [i, r] = await Promise.all([
      api.get<Item[]>(`/api/projects/${projectId}/items`),
      api.get<Room[]>(`/api/projects/${projectId}/rooms`),
    ])
    setItems((i.data as Item[]) ?? [])
    setRooms((r.data as Room[]) ?? [])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const filtered = useMemo(() => {
    return (items ?? []).filter((it) => {
      if (filter.status && it.status !== filter.status) return false
      if (filter.room && it.room_id !== filter.room) return false
      return true
    })
  }, [items, filter])

  const updateStatus = async (id: string, status: ItemStatus) => {
    try {
      await api.patch(`/api/projects/${projectId}/items/${id}`, { status })
      setItems((s) => (s ? s.map((it) => (it.id === id ? { ...it, status } : it)) : s))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex flex-wrap gap-2">
          <Select
            value={filter.status ?? ''}
            onChange={(e) =>
              setFilter((f) => ({ ...f, status: e.target.value || undefined }))
            }
            className="!py-2 !text-[0.9rem]"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </Select>
          <Select
            value={filter.room ?? ''}
            onChange={(e) =>
              setFilter((f) => ({ ...f, room: e.target.value || undefined }))
            }
            className="!py-2 !text-[0.9rem]"
          >
            <option value="">All rooms</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <ManageRoomsButton projectId={projectId} rooms={rooms} onChange={load} />
          <Button variant="primary" onClick={() => setOpenAdd(true)}>
            + Add item
          </Button>
        </div>
      </div>

      {items === null ? (
        <PageSpinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={items.length === 0 ? 'No items yet' : 'No matches'}
          body={
            items.length === 0
              ? 'Add the first item to start building this project. Items are saved to your catalog automatically.'
              : 'Adjust the filters to see more.'
          }
          action={
            items.length === 0 ? (
              <Button variant="primary" onClick={() => setOpenAdd(true)}>
                Add first item
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="border border-hm-text/10">
          <div className="hidden md:grid grid-cols-[64px_2fr_1fr_120px_120px_140px_120px] gap-4 items-center px-4 py-3 border-b border-hm-text/10 font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav">
            <div></div>
            <div>Item</div>
            <div>Room</div>
            <div className="text-right">Trade</div>
            <div className="text-right">Client</div>
            <div>Status</div>
            <div></div>
          </div>
          {filtered.map((it) => {
            const room = rooms.find((r) => r.id === it.room_id)
            return (
              <div
                key={it.id}
                onClick={(e) => {
                  // Don't open edit when clicking the inline status select.
                  const tag = (e.target as HTMLElement).tagName
                  if (tag === 'SELECT' || tag === 'OPTION') return
                  setEditing(it)
                }}
                className="grid grid-cols-[64px_1fr_auto] md:grid-cols-[64px_2fr_1fr_120px_120px_140px_120px] gap-4 items-center px-4 py-3 border-t border-hm-text/10 hover:bg-hm-text/[0.02] transition-colors cursor-pointer"
              >
                <div className="w-12 h-12 bg-hm-text/[0.05] rounded-sm overflow-hidden shrink-0">
                  {it.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.image_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <div className="font-serif text-[1.05rem] leading-tight truncate">
                    {it.name}
                  </div>
                  <div className="font-garamond text-[0.85rem] text-hm-nav truncate">
                    {it.vendor ?? 'No vendor'}
                    {it.quantity > 1 ? ` · qty ${it.quantity}` : ''}
                  </div>
                </div>
                <div className="hidden md:block font-garamond text-[0.95rem] text-hm-nav">
                  {room?.name ?? '—'}
                </div>
                <div className="hidden md:block text-right font-garamond text-[0.95rem] text-hm-nav">
                  {formatCents(it.trade_price_cents)}
                </div>
                <div className="hidden md:block text-right font-garamond text-[0.95rem] text-hm-text">
                  {formatCents(it.client_price_cents)}
                </div>
                <div className="hidden md:block">
                  <Select
                    value={it.status}
                    onChange={(e) =>
                      updateStatus(it.id, e.target.value as ItemStatus)
                    }
                    className="!py-1.5 !text-[0.8rem]"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {titleCase(s)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="md:hidden">
                  <StatusBadge kind="item" status={it.status} />
                </div>
                <div className="hidden md:flex justify-end">
                  <span className="font-garamond text-[0.85rem] text-hm-nav">
                    {formatCents(it.client_price_cents * it.quantity)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AddItemDrawer
        open={openAdd}
        projectId={projectId}
        rooms={rooms}
        onClose={() => setOpenAdd(false)}
        onAdded={() => {
          setOpenAdd(false)
          load()
          toast.success('Item added')
        }}
      />

      <EditItemDrawer
        open={editing !== null}
        projectId={projectId}
        item={editing}
        rooms={rooms}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          load()
        }}
        onDeleted={() => {
          setEditing(null)
          load()
        }}
      />
    </div>
  )
}

function AddItemDrawer({
  open,
  onClose,
  projectId,
  rooms,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  projectId: string
  rooms: Room[]
  onAdded: () => void
}) {
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
        <CatalogSearch
          projectId={projectId}
          rooms={rooms}
          onAdded={onAdded}
        />
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
          <div className="w-20 h-20 bg-hm-text/[0.05] shrink-0">
            {picking.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={picking.image_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : null}
          </div>
          <div>
            <div className="font-serif text-[1.1rem] leading-tight">
              {picking.name}
            </div>
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
              <div className="w-12 h-12 bg-hm-text/[0.05] shrink-0">
                {r.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.image_url} alt="" className="w-full h-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-serif text-[1rem] leading-tight truncate">
                  {r.name}
                </div>
                <div className="font-garamond text-[0.85rem] text-hm-nav truncate">
                  {r.vendor ?? 'Unknown'}
                  {r.retail_price_cents != null
                    ? ` · ${formatCents(r.retail_price_cents)}`
                    : ''}
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
      <Field label="Image URL">
        <Input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://…"
        />
      </Field>
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
