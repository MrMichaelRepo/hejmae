'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatCents, formatDate } from '@/lib/format'
import { PageSpinner } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'
import type { Invoice, InvoiceLine, Payment, InvoiceType } from '@/lib/types-ui'

interface InvoiceWith extends Invoice {
  invoice_line_items?: InvoiceLine[]
  payments?: Payment[]
}

interface NewLine {
  description: string
  quantity: number
  unit_price_cents: number
}

export default function InvoicesClient({ projectId }: { projectId: string }) {
  const [invoices, setInvoices] = useState<InvoiceWith[] | null>(null)
  const [openCreate, setOpenCreate] = useState(false)

  const load = async () => {
    const r = await api.get<InvoiceWith[]>(`/api/projects/${projectId}/invoices`)
    setInvoices((r.data as InvoiceWith[]) ?? [])
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const sendInvoice = async (id: string) => {
    try {
      const res = await api.patch<Invoice>(
        `/api/projects/${projectId}/invoices/${id}`,
        { action: 'send' },
      )
      const url = (res as { magic_link_url?: string }).magic_link_url
      if (url) {
        navigator.clipboard.writeText(url)
        toast.success('Invoice sent — pay link copied')
      } else {
        toast.success('Invoice sent')
      }
      load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const markPaid = async (id: string) => {
    try {
      await api.patch(`/api/projects/${projectId}/invoices/${id}`, {
        action: 'mark_paid',
      })
      load()
      toast.success('Invoice marked paid')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (invoices === null) return <PageSpinner />

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav">
          Invoices ({invoices.length})
        </div>
        <Button variant="primary" onClick={() => setOpenCreate(true)}>
          + New invoice
        </Button>
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          body="Bill the client by creating an invoice from approved items, or build one manually."
          action={
            <Button variant="primary" onClick={() => setOpenCreate(true)}>
              Create first invoice
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => {
            const paid =
              (inv.payments ?? []).reduce((a, p) => a + p.amount_cents, 0) || 0
            const outstanding = Math.max(0, inv.total_cents - paid)
            return (
              <div key={inv.id} className="border border-hm-text/10">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <div className="font-serif text-[1.1rem] leading-tight">
                      Invoice · {formatDate(inv.created_at)}{' '}
                      <span className="font-garamond text-[0.85rem] text-hm-nav">
                        {inv.type}
                      </span>
                    </div>
                    <div className="font-garamond text-[0.9rem] text-hm-nav mt-1">
                      Total {formatCents(inv.total_cents)} · Outstanding{' '}
                      {formatCents(outstanding)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge kind="invoice" status={inv.status} />
                    {inv.status === 'draft' ? (
                      <Button size="sm" variant="primary" onClick={() => sendInvoice(inv.id)}>
                        Send
                      </Button>
                    ) : (
                      <>
                        {inv.magic_link_token ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const url = `${window.location.origin}/portal/invoices/${inv.magic_link_token}`
                              navigator.clipboard.writeText(url)
                              toast.success('Pay link copied')
                            }}
                          >
                            Copy pay link
                          </Button>
                        ) : null}
                        {inv.status !== 'paid' ? (
                          <Button size="sm" variant="ghost" onClick={() => markPaid(inv.id)}>
                            Mark paid
                          </Button>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
                {(inv.invoice_line_items ?? []).length > 0 ? (
                  <div className="border-t border-hm-text/10 px-5 py-3 bg-hm-text/[0.02]">
                    <table className="w-full font-garamond text-[0.95rem]">
                      <tbody>
                        {(inv.invoice_line_items ?? []).map((l) => (
                          <tr key={l.id}>
                            <td className="py-1">{l.description}</td>
                            <td className="py-1 text-right text-hm-nav w-16">
                              {l.quantity}
                            </td>
                            <td className="py-1 text-right w-28">
                              {formatCents(l.unit_price_cents)}
                            </td>
                            <td className="py-1 text-right w-28">
                              {formatCents(l.total_price_cents)}
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

      <CreateInvoiceModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        projectId={projectId}
        onCreated={() => {
          setOpenCreate(false)
          load()
          toast.success('Invoice drafted')
        }}
      />
    </div>
  )
}

function CreateInvoiceModal({
  open,
  onClose,
  projectId,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  projectId: string
  onCreated: () => void
}) {
  const [type, setType] = useState<InvoiceType>('progress')
  const [fromApproved, setFromApproved] = useState(true)
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<NewLine[]>([
    { description: '', quantity: 1, unit_price_cents: 0 },
  ])
  const [submitting, setSubmitting] = useState(false)

  const update = (i: number, patch: Partial<NewLine>) =>
    setLines((s) => s.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))

  const submit = async () => {
    setSubmitting(true)
    try {
      const cleanLines = lines
        .filter((l) => l.description.trim())
        .map((l) => ({
          description: l.description.trim(),
          quantity: l.quantity,
          unit_price_cents: l.unit_price_cents,
        }))
      const body: Record<string, unknown> = {
        type,
        notes: notes.trim() || null,
      }
      if (cleanLines.length) body.lines = cleanLines
      if (fromApproved) body.from_approved_items = true
      await api.post(`/api/projects/${projectId}/invoices`, body)
      onCreated()
      setLines([{ description: '', quantity: 1, unit_price_cents: 0 }])
      setNotes('')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New invoice" size="lg">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as InvoiceType)}>
            <option value="deposit">Deposit / retainer</option>
            <option value="progress">Progress</option>
            <option value="final">Final</option>
          </Select>
        </Field>
        <Field label="Auto-fill from approved items">
          <label className="flex items-center gap-2 mt-2.5">
            <input
              type="checkbox"
              checked={fromApproved}
              onChange={(e) => setFromApproved(e.target.checked)}
            />
            <span className="font-garamond text-[0.95rem] text-hm-nav">
              Pull every approved item into the invoice
            </span>
          </label>
        </Field>
      </div>

      <Field label="Manual line items (optional)">
        <div className="border border-hm-text/10">
          <div className="grid grid-cols-[1fr_80px_120px_120px_40px] gap-2 px-3 py-2 border-b border-hm-text/10 bg-hm-text/[0.02] font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav">
            <div>Description</div>
            <div className="text-right">Qty</div>
            <div className="text-right">Unit</div>
            <div className="text-right">Total</div>
            <div></div>
          </div>
          {lines.map((l, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_80px_120px_120px_40px] gap-2 px-3 py-2 border-t border-hm-text/10 first:border-t-0 items-center"
            >
              <Input
                value={l.description}
                onChange={(e) => update(i, { description: e.target.value })}
                placeholder="Design fee, retainer…"
              />
              <Input
                type="number"
                min={1}
                value={l.quantity}
                onChange={(e) =>
                  update(i, { quantity: Number(e.target.value) || 1 })
                }
                className="text-right"
              />
              <Input
                value={(l.unit_price_cents / 100 || '').toString()}
                onChange={(e) =>
                  update(i, {
                    unit_price_cents:
                      Math.round(Number(e.target.value || 0) * 100) || 0,
                  })
                }
                inputMode="decimal"
                placeholder="0.00"
                className="text-right"
              />
              <div className="text-right font-garamond text-[0.95rem] text-hm-nav">
                {formatCents(l.unit_price_cents * l.quantity)}
              </div>
              <button
                onClick={() => setLines((s) => s.filter((_, idx) => idx !== i))}
                className="font-sans text-[14px] text-hm-nav hover:text-red-700"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2">
          <button
            onClick={() =>
              setLines((s) => [
                ...s,
                { description: '', quantity: 1, unit_price_cents: 0 },
              ])
            }
            className="font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav hover:text-hm-text"
          >
            + Add line
          </button>
        </div>
      </Field>

      <Field label="Notes">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Payment terms, scope notes…"
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
