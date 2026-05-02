'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatCents } from '@/lib/format'
import Button from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'
import type { CatalogProduct, Project, Room } from '@/lib/types-ui'

export default function AddToProjectModal({
  open,
  onClose,
  product,
}: {
  open: boolean
  onClose: () => void
  product: CatalogProduct | null
}) {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [rooms, setRooms] = useState<Room[]>([])
  const [roomId, setRoomId] = useState('')
  const [trade, setTrade] = useState('')
  const [qty, setQty] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    api.get<Project[]>('/api/projects?status=active').then((r) => {
      const ps = (r.data as Project[]) ?? []
      setProjects(ps)
      if (ps[0]) setProjectId(ps[0].id)
    })
  }, [open])

  useEffect(() => {
    if (!projectId) {
      setRooms([])
      setRoomId('')
      return
    }
    api
      .get<Room[]>(`/api/projects/${projectId}/rooms`)
      .then((r) => setRooms((r.data as Room[]) ?? []))
  }, [projectId])

  if (!product) return null

  const submit = async () => {
    if (!projectId) {
      toast.error('Pick a project first')
      return
    }
    setSubmitting(true)
    try {
      await api.post(`/api/projects/${projectId}/items`, {
        catalog_product_id: product.id,
        name: product.name,
        vendor: product.vendor,
        image_url: product.image_url,
        source_url: product.source_url,
        retail_price_cents: product.retail_price_cents,
        trade_price_cents: trade
          ? Math.round(Number(trade) * 100)
          : 0,
        quantity: qty,
        room_id: roomId || null,
      })
      toast.success('Item added to project')
      onClose()
      // Reset form for next time
      setRoomId('')
      setTrade('')
      setQty(1)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add to project">
      <div className="flex gap-4 items-start mb-5 pb-5 border-b border-hm-text/10">
        <div className="w-20 h-20 bg-hm-text/[0.05] shrink-0">
          {product.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image_url}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : null}
        </div>
        <div className="min-w-0">
          <div className="font-serif text-[1.1rem] leading-tight">
            {product.name}
          </div>
          <div className="font-garamond text-[0.9rem] text-hm-nav mt-1">
            {product.vendor ?? 'Unknown vendor'}
          </div>
          {product.retail_price_cents != null ? (
            <div className="font-garamond text-[0.9rem] text-hm-nav mt-1">
              Retail: {formatCents(product.retail_price_cents)}
            </div>
          ) : null}
        </div>
      </div>

      <Field label="Project">
        {projects.length === 0 ? (
          <div className="font-garamond text-[0.95rem] text-hm-nav border border-hm-text/15 px-3 py-2.5">
            No active projects. Create one first.
          </div>
        ) : (
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Room">
          <Select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">No room yet</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
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

      <Field label="Your trade price (USD)">
        <Input
          value={trade}
          onChange={(e) => setTrade(e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
        />
      </Field>

      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={submit}
          loading={submitting}
          disabled={projects.length === 0}
        >
          Add to project
        </Button>
      </div>
    </Modal>
  )
}
