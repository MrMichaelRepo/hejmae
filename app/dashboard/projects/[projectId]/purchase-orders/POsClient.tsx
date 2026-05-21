'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatCents, formatDate } from '@/lib/format'
import EmptyState from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import { Checkbox } from '@/components/ui/Checkbox'
import Modal from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'
import type {
  PurchaseOrder,
  PurchaseOrderLine,
  Item,
  PoStatus,
} from '@/lib/types-ui'

export interface POWith extends PurchaseOrder {
  purchase_order_line_items?: PurchaseOrderLine[]
}

interface Props {
  projectId: string
  initialPOs: POWith[]
  initialItems: Item[]
}

export default function POsClient({ projectId, initialPOs, initialItems }: Props) {
  const [pos, setPos] = useState<POWith[]>(initialPOs)
  const [items, setItems] = useState<Item[]>(initialItems)
  const [openCreate, setOpenCreate] = useState(false)
  const [editing, setEditing] = useState<POWith | null>(null)

  const load = async () => {
    const [p, i] = await Promise.all([
      api.get<POWith[]>(`/api/projects/${projectId}/purchase-orders`),
      api.get<Item[]>(`/api/projects/${projectId}/items`),
    ])
    setPos((p.data as POWith[]) ?? [])
    setItems((i.data as Item[]) ?? [])
  }

  const advance = async (
    id: string,
    action: 'send' | 'mark_acknowledged' | 'mark_received' | 'mark_complete',
  ) => {
    try {
      await api.patch(`/api/projects/${projectId}/purchase-orders/${id}`, {
        action,
      })
      load()
      toast.success('Updated')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted">
          Purchase orders ({pos.length})
        </div>
        <Button variant="primary" onClick={() => setOpenCreate(true)}>
          + New PO
        </Button>
      </div>

      {pos.length === 0 ? (
        <EmptyState
          title="No purchase orders yet"
          body="POs are grouped by vendor automatically and generated from your approved items. Send each one to the vendor by email."
          action={
            <Button variant="primary" onClick={() => setOpenCreate(true)}>
              Create first PO
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {pos.map((po) => {
            const total =
              (po.purchase_order_line_items ?? []).reduce(
                (a, l) => a + l.total_trade_price_cents,
                0,
              ) || 0
            return (
              <div key={po.id} className="border border-line">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <div className="font-serif text-[1.1rem] leading-tight">
                      {po.vendor_name}
                    </div>
                    <div className="font-garamond text-[0.9rem] text-ink-muted mt-1">
                      {formatDate(po.created_at)} · {formatCents(total)}
                      {po.expected_lead_time_days
                        ? ` · ${po.expected_lead_time_days}d lead`
                        : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <StatusBadge kind="po" status={po.status} />
                    <DeliveryBadge po={po} />
                    <Button size="sm" variant="ghost" onClick={() => setEditing(po)}>
                      Tracking
                    </Button>
                    <Link
                      href={`/dashboard/projects/${projectId}/purchase-orders/${po.id}/print`}
                      target="_blank"
                    >
                      <Button size="sm" variant="ghost">
                        Print
                      </Button>
                    </Link>
                    <a
                      href={`/api/projects/${projectId}/purchase-orders/${po.id}/pdf`}
                      download
                      title="Download PDF"
                    >
                      <Button size="sm" variant="ghost">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        PDF
                      </Button>
                    </a>
                    <NextAction status={po.status} onAdvance={(a) => advance(po.id, a)} />
                  </div>
                </div>
                {(po.purchase_order_line_items ?? []).length > 0 ? (
                  <div className="border-t border-line px-5 py-3 bg-ink/[0.02]">
                    <table className="w-full font-garamond text-[0.95rem]">
                      <tbody>
                        {(po.purchase_order_line_items ?? []).map((l) => (
                          <tr key={l.id}>
                            <td className="py-1">{l.description}</td>
                            <td className="py-1 text-right text-ink-muted w-16">
                              {l.quantity}
                            </td>
                            <td className="py-1 text-right w-28">
                              {formatCents(l.trade_price_cents)}
                            </td>
                            <td className="py-1 text-right w-28">
                              {formatCents(l.total_trade_price_cents)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      <CreatePOModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        projectId={projectId}
        items={items}
        onCreated={() => {
          setOpenCreate(false)
          load()
          toast.success('PO drafted')
        }}
      />
      <TrackingModal
        po={editing}
        projectId={projectId}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          load()
          toast.success('Tracking updated')
        }}
      />
    </div>
  )
}

function NextAction({
  status,
  onAdvance,
}: {
  status: PoStatus
  onAdvance: (
    action: 'send' | 'mark_acknowledged' | 'mark_received' | 'mark_complete',
  ) => void
}) {
  if (status === 'draft')
    return (
      <Button size="sm" variant="primary" onClick={() => onAdvance('send')}>
        Send
      </Button>
    )
  if (status === 'sent')
    return (
      <Button size="sm" variant="ghost" onClick={() => onAdvance('mark_acknowledged')}>
        Acknowledged
      </Button>
    )
  if (status === 'acknowledged')
    return (
      <Button size="sm" variant="ghost" onClick={() => onAdvance('mark_received')}>
        Received
      </Button>
    )
  if (status === 'partially_received')
    return (
      <Button size="sm" variant="ghost" onClick={() => onAdvance('mark_complete')}>
        Complete
      </Button>
    )
  return null
}

function DeliveryBadge({ po }: { po: POWith }) {
  const label = po.delivered_at
    ? `Delivered ${formatDate(po.delivered_at)}`
    : po.shipped_at
      ? `Shipped ${formatDate(po.shipped_at)}`
      : po.expected_delivery_date
        ? `ETA ${formatDate(po.expected_delivery_date)}`
        : null
  if (!label) return null
  return (
    <span className="text-[10px] uppercase tracking-[0.18em] px-2 py-1 border border-line text-ink-muted">
      {label}
    </span>
  )
}

function CreatePOModal({
  open,
  onClose,
  projectId,
  items,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  projectId: string
  items: Item[]
  onCreated: () => void
}) {
  const [vendorName, setVendorName] = useState('')
  const [vendorEmail, setVendorEmail] = useState('')
  const [leadTime, setLeadTime] = useState('')
  const [notes, setNotes] = useState('')
  const [fromApproved, setFromApproved] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Vendor list derived from approved items.
  const vendors = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .filter((i) => i.status === 'approved' && i.vendor)
            .map((i) => i.vendor as string),
        ),
      ).sort(),
    [items],
  )

  const submit = async () => {
    if (!vendorName.trim()) {
      toast.error('Vendor name is required')
      return
    }
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        vendor_name: vendorName.trim(),
        vendor_email: vendorEmail.trim() || null,
        notes: notes.trim() || null,
      }
      if (leadTime) body.expected_lead_time_days = Number(leadTime) || null
      if (fromApproved) body.from_approved_items = true
      await api.post(`/api/projects/${projectId}/purchase-orders`, body)
      onCreated()
      setVendorName('')
      setVendorEmail('')
      setLeadTime('')
      setNotes('')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New purchase order">
      <Field label="Vendor name">
        {vendors.length > 0 ? (
          <Select
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
          >
            <option value="">Pick a vendor with approved items…</option>
            {vendors.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            placeholder="e.g. Roll & Hill"
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Vendor email">
          <Input
            value={vendorEmail}
            onChange={(e) => setVendorEmail(e.target.value)}
            type="email"
            placeholder="orders@vendor.com"
          />
        </Field>
        <Field label="Expected lead time (days)">
          <Input
            value={leadTime}
            onChange={(e) => setLeadTime(e.target.value)}
            type="number"
            min={0}
          />
        </Field>
      </div>
      <Field label="Auto-fill from approved items">
        <Checkbox
          className="mt-1"
          checked={fromApproved}
          onChange={(e) => setFromApproved(e.target.checked)}
          label="Pull all approved items from this vendor onto the PO"
        />
      </Field>
      <Field label="Notes to vendor">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Ship-to address, finish callouts, deadlines…"
        />
      </Field>
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} loading={submitting}>
          Create draft
        </Button>
      </div>
    </Modal>
  )
}

function TrackingModal({
  po,
  projectId,
  onClose,
  onSaved,
}: {
  po: POWith | null
  projectId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [expectedDate, setExpectedDate] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [trackingUrl, setTrackingUrl] = useState('')
  const [shippedAt, setShippedAt] = useState('')
  const [deliveredAt, setDeliveredAt] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!po) return
    setExpectedDate(po.expected_delivery_date?.slice(0, 10) ?? '')
    setTrackingNumber(po.tracking_number ?? '')
    setTrackingUrl(po.tracking_url ?? '')
    setShippedAt(po.shipped_at?.slice(0, 10) ?? '')
    setDeliveredAt(po.delivered_at?.slice(0, 10) ?? '')
  }, [po])

  const submit = async () => {
    if (!po) return
    setSubmitting(true)
    try {
      await api.patch(`/api/projects/${projectId}/purchase-orders/${po.id}`, {
        expected_delivery_date: expectedDate || null,
        tracking_number: trackingNumber.trim() || null,
        tracking_url: trackingUrl.trim() || null,
        shipped_at: shippedAt ? new Date(shippedAt).toISOString() : null,
        delivered_at: deliveredAt ? new Date(deliveredAt).toISOString() : null,
      })
      onSaved()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={Boolean(po)} onClose={onClose} title="Tracking">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Expected delivery">
          <Input
            type="date"
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
          />
        </Field>
        <Field label="Tracking number">
          <Input
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="1Z..."
          />
        </Field>
      </div>
      <Field label="Tracking URL">
        <Input
          value={trackingUrl}
          onChange={(e) => setTrackingUrl(e.target.value)}
          placeholder="https://..."
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Shipped at">
          <Input
            type="date"
            value={shippedAt}
            onChange={(e) => setShippedAt(e.target.value)}
          />
        </Field>
        <Field label="Delivered at">
          <Input
            type="date"
            value={deliveredAt}
            onChange={(e) => setDeliveredAt(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} loading={submitting}>
          Save
        </Button>
      </div>
    </Modal>
  )
}
