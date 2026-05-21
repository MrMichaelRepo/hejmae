'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { formatCents, titleCase } from '@/lib/format'
import EmptyState from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'
import { ManageRoomsButton } from '@/components/ui/RoomManager'
import AddItemDrawer from './AddItemDrawer'
import EditItemDrawer from './EditItemDrawer'
import type { Item, Room, ItemStatus } from '@/lib/types-ui'

const STATUSES: ItemStatus[] = [
  'sourcing',
  'approved',
  'ordered',
  'received',
  'installed',
]

interface Props {
  projectId: string
  initialItems: Item[]
  initialRooms: Room[]
}

export default function ItemsClient({ projectId, initialItems, initialRooms }: Props) {
  const searchParams = useSearchParams()
  const initialStatus = searchParams.get('status') ?? undefined
  const [items, setItems] = useState<Item[]>(initialItems)
  const [rooms, setRooms] = useState<Room[]>(initialRooms)
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

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (filter.status && it.status !== filter.status) return false
      if (filter.room && it.room_id !== filter.room) return false
      return true
    })
  }, [items, filter])

  const updateStatus = async (id: string, status: ItemStatus) => {
    try {
      await api.patch(`/api/projects/${projectId}/items/${id}`, { status })
      setItems((s) => s.map((it) => (it.id === id ? { ...it, status } : it)))
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

      {filtered.length === 0 ? (
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
        <div className="border border-line">
          <div className="hidden md:grid grid-cols-[64px_2fr_1fr_120px_120px_140px_120px] gap-4 items-center px-4 py-3 border-b border-line font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted">
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
                className="grid grid-cols-[64px_1fr_auto] md:grid-cols-[64px_2fr_1fr_120px_120px_140px_120px] gap-4 items-center px-4 py-3 border-t border-line hover:bg-ink/[0.03] transition-colors cursor-pointer"
              >
                <div className="w-12 h-12 bg-ink/[0.05] rounded-sm overflow-hidden shrink-0 relative">
                  {it.image_url ? (
                    <Image
                      src={it.image_url}
                      alt=""
                      fill
                      sizes="48px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <div className="font-serif text-[1.05rem] leading-tight truncate">
                    {it.name}
                  </div>
                  <div className="font-garamond text-[0.85rem] text-ink-muted truncate">
                    {it.vendor ?? 'No vendor'}
                    {it.quantity > 1 ? ` · qty ${it.quantity}` : ''}
                  </div>
                </div>
                <div className="hidden md:block font-garamond text-[0.95rem] text-ink-muted">
                  {room?.name ?? '—'}
                </div>
                <div className="hidden md:block text-right font-garamond text-[0.95rem] text-ink-muted">
                  {formatCents(it.trade_price_cents)}
                </div>
                <div className="hidden md:block text-right font-garamond text-[0.95rem] text-ink">
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
                  <span className="font-garamond text-[0.85rem] text-ink-muted">
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
