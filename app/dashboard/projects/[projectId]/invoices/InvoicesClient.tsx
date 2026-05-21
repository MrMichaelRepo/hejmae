'use client'

import { useState } from 'react'
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
  Invoice,
  InvoiceLine,
  Payment,
  InvoiceType,
  DefaultInvoiceEmailMode,
} from '@/lib/types-ui'
import SendInvoiceModal from './SendInvoiceModal'
import EditInvoiceModal from './EditInvoiceModal'
import RefundModal from './RefundModal'
import VoidModal from './VoidModal'

export interface InvoiceWith extends Invoice {
  invoice_line_items?: InvoiceLine[]
  payments?: Payment[]
}

interface NewLine {
  description: string
  quantity: number
  unit_price_cents: number
}

interface Props {
  projectId: string
  initialInvoices: InvoiceWith[]
  clientName: string | null
  clientEmail: string | null
  studioEmail: string
  studioName: string
  brandColor: string | null
  defaultEmailMode: DefaultInvoiceEmailMode
}

type ActionModal =
  | { kind: 'send'; invoice: InvoiceWith; flavor: 'initial' | 'reminder' }
  | { kind: 'edit'; invoice: InvoiceWith }
  | { kind: 'refund'; invoice: InvoiceWith }
  | { kind: 'void'; invoice: InvoiceWith }

export default function InvoicesClient({
  projectId,
  initialInvoices,
  clientName,
  clientEmail,
  studioEmail,
  studioName,
  brandColor,
  defaultEmailMode,
}: Props) {
  const [invoices, setInvoices] = useState<InvoiceWith[]>(initialInvoices)
  const [openCreate, setOpenCreate] = useState(false)
  const [active, setActive] = useState<ActionModal | null>(null)

  const load = async () => {
    const r = await api.get<InvoiceWith[]>(`/api/projects/${projectId}/invoices`)
    setInvoices((r.data as InvoiceWith[]) ?? [])
  }

  const copyPayLink = async (id: string) => {
    try {
      const res = await api.patch<Invoice>(
        `/api/projects/${projectId}/invoices/${id}`,
        { action: 'rotate_link' },
      )
      const url = (res as { magic_link_url?: string }).magic_link_url
      if (!url) throw new Error('No link returned')
      navigator.clipboard.writeText(url)
      toast.success('New pay link copied — previous link is now invalid')
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

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted">
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
              <div key={inv.id} className="border border-line">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <div className="font-serif text-[1.1rem] leading-tight">
                      Invoice · {formatDate(inv.created_at)}{' '}
                      <span className="font-garamond text-[0.85rem] text-ink-muted">
                        {inv.type}
                      </span>
                    </div>
                    <div className="font-garamond text-[0.9rem] text-ink-muted mt-1">
                      Total {formatCents(inv.total_cents)} · Outstanding{' '}
                      {formatCents(outstanding)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge kind="invoice" status={inv.status} />
                    <a
                      href={`/dashboard/projects/${projectId}/invoices/${inv.id}/print`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button size="sm" variant="ghost">Print</Button>
                    </a>
                    <a
                      href={`/api/projects/${projectId}/invoices/${inv.id}/pdf`}
                      download
                      title="Download PDF"
                    >
                      <Button size="sm" variant="ghost">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        PDF
                      </Button>
                    </a>
                    {renderRowActions(inv, {
                      onEdit: () => setActive({ kind: 'edit', invoice: inv }),
                      onSend: () =>
                        setActive({ kind: 'send', invoice: inv, flavor: 'initial' }),
                      onResend: () =>
                        setActive({ kind: 'send', invoice: inv, flavor: 'initial' }),
                      onReminder: () =>
                        setActive({ kind: 'send', invoice: inv, flavor: 'reminder' }),
                      onCopyLink: () => copyPayLink(inv.id),
                      onMarkPaid: () => markPaid(inv.id),
                      onRefund: () => setActive({ kind: 'refund', invoice: inv }),
                      onVoid: () => setActive({ kind: 'void', invoice: inv }),
                    })}
                  </div>
                </div>
                {(inv.invoice_line_items ?? []).length > 0 ? (
                  <div className="border-t border-line px-5 py-3 bg-ink/[0.02]">
                    <table className="w-full font-garamond text-[0.95rem]">
                      <tbody>
                        {(inv.invoice_line_items ?? []).map((l) => (
                          <tr key={l.id}>
                            <td className="py-1">{l.description}</td>
                            <td className="py-1 text-right text-ink-muted w-16">
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

      {active?.kind === 'send' ? (
        <SendInvoiceModal
          open
          projectId={projectId}
          invoice={active.invoice}
          clientEmail={clientEmail}
          clientName={clientName}
          studioEmail={studioEmail}
          studioName={studioName}
          brandColor={brandColor}
          defaultMode={defaultEmailMode}
          kind={active.flavor}
          onClose={() => setActive(null)}
          onSent={() => {
            load()
          }}
        />
      ) : null}

      {active?.kind === 'edit' ? (
        <EditInvoiceModal
          open
          projectId={projectId}
          invoice={active.invoice}
          onClose={() => setActive(null)}
          onSaved={() => {
            setActive(null)
            load()
            toast.success('Invoice updated')
          }}
        />
      ) : null}

      {active?.kind === 'refund' ? (
        <RefundModal
          open
          projectId={projectId}
          invoice={active.invoice}
          onClose={() => setActive(null)}
          onRefunded={() => {
            setActive(null)
            load()
          }}
        />
      ) : null}

      {active?.kind === 'void' ? (
        <VoidModal
          open
          projectId={projectId}
          invoice={active.invoice}
          onClose={() => setActive(null)}
          onVoided={() => {
            setActive(null)
            load()
          }}
        />
      ) : null}
    </div>
  )
}

interface RowActionHandlers {
  onEdit: () => void
  onSend: () => void
  onResend: () => void
  onReminder: () => void
  onCopyLink: () => void
  onMarkPaid: () => void
  onRefund: () => void
  onVoid: () => void
}

function renderRowActions(
  inv: InvoiceWith,
  h: RowActionHandlers,
) {
  const paid = (inv.payments ?? []).reduce((a, p) => a + p.amount_cents, 0)
  const refundable = paid - (inv.refunded_cents ?? 0)

  if (inv.status === 'draft') {
    return (
      <>
        <Button size="sm" variant="ghost" onClick={h.onEdit}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" onClick={h.onVoid}>
          Void
        </Button>
        <Button size="sm" variant="primary" onClick={h.onSend}>
          Send
        </Button>
      </>
    )
  }

  if (inv.status === 'sent' || inv.status === 'partially_paid') {
    return (
      <>
        <Button size="sm" variant="ghost" onClick={h.onCopyLink}>
          Copy pay link
        </Button>
        <Button size="sm" variant="ghost" onClick={h.onReminder}>
          Send reminder
        </Button>
        <Button size="sm" variant="ghost" onClick={h.onResend}>
          Resend
        </Button>
        <Button size="sm" variant="ghost" onClick={h.onMarkPaid}>
          Mark paid
        </Button>
        {refundable > 0 ? (
          <Button size="sm" variant="ghost" onClick={h.onRefund}>
            Refund
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={h.onVoid}>
            Void
          </Button>
        )}
      </>
    )
  }

  if (inv.status === 'paid') {
    return refundable > 0 ? (
      <Button size="sm" variant="ghost" onClick={h.onRefund}>
        Refund
      </Button>
    ) : null
  }

  // status === 'void'
  return (
    <span className="font-sans text-[10px] uppercase tracking-[0.2em] text-ink-muted">
      Voided
    </span>
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
          <Checkbox
            className="mt-2.5"
            checked={fromApproved}
            onChange={(e) => setFromApproved(e.target.checked)}
            label="Pull every approved item into the invoice"
          />
        </Field>
      </div>

      <Field label="Manual line items (optional)">
        <div className="border border-line">
          <div className="grid grid-cols-[1fr_80px_120px_120px_40px] gap-2 px-3 py-2 border-b border-line bg-ink/[0.02] font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted">
            <div>Description</div>
            <div className="text-right">Qty</div>
            <div className="text-right">Unit</div>
            <div className="text-right">Total</div>
            <div></div>
          </div>
          {lines.map((l, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_80px_120px_120px_40px] gap-2 px-3 py-2 border-t border-line first:border-t-0 items-center"
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
              <div className="text-right font-garamond text-[0.95rem] text-ink-muted">
                {formatCents(l.unit_price_cents * l.quantity)}
              </div>
              <button
                onClick={() => setLines((s) => s.filter((_, idx) => idx !== i))}
                className="font-sans text-[14px] text-ink-muted hover:text-danger"
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
            className="font-sans text-[10px] uppercase tracking-[0.2em] text-ink-muted hover:text-ink"
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
