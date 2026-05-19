'use client'

// Edit a draft invoice's line items + notes + type. Only enabled when
// status='draft' (server-side enforced too). Recomputes total on submit.

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'
import { api } from '@/lib/api'
import { formatCents } from '@/lib/format'
import type { Invoice, InvoiceLine, InvoiceType } from '@/lib/types-ui'

interface NewLine {
  description: string
  quantity: number
  unit_price_cents: number
}

interface Props {
  open: boolean
  projectId: string
  invoice: Invoice & { invoice_line_items?: InvoiceLine[] }
  onClose: () => void
  onSaved: () => void
}

export default function EditInvoiceModal({
  open,
  projectId,
  invoice,
  onClose,
  onSaved,
}: Props) {
  const [type, setType] = useState<InvoiceType>(invoice.type)
  const [notes, setNotes] = useState(invoice.notes ?? '')
  const [lines, setLines] = useState<NewLine[]>(() => seed(invoice.invoice_line_items))
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setType(invoice.type)
    setNotes(invoice.notes ?? '')
    setLines(seed(invoice.invoice_line_items))
  }, [open, invoice])

  const update = (i: number, patch: Partial<NewLine>) =>
    setLines((s) => s.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))

  const total = lines.reduce(
    (acc, l) => acc + l.unit_price_cents * l.quantity,
    0,
  )

  const submit = async () => {
    const clean = lines
      .map((l) => ({
        description: l.description.trim(),
        quantity: l.quantity || 1,
        unit_price_cents: l.unit_price_cents || 0,
      }))
      .filter((l) => l.description.length > 0)
    if (!clean.length) {
      toast.error('Invoice must have at least one line item')
      return
    }
    setSubmitting(true)
    try {
      await api.patch(`/api/projects/${projectId}/invoices/${invoice.id}`, {
        action: 'edit_lines',
        type,
        notes: notes.trim() || null,
        lines: clean,
      })
      onSaved()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit invoice" size="lg">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as InvoiceType)}>
            <option value="deposit">Deposit / retainer</option>
            <option value="progress">Progress</option>
            <option value="final">Final</option>
          </Select>
        </Field>
        <Field label="Computed total">
          <div className="mt-2.5 font-serif text-[1.2rem]">{formatCents(total)}</div>
        </Field>
      </div>

      <Field label="Line items">
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
                onChange={(e) => update(i, { quantity: Number(e.target.value) || 1 })}
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
                aria-label="Remove line"
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

      <div className="flex justify-end gap-3 border-t border-hm-text/10 pt-5 mt-2">
        <Button variant="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} loading={submitting}>
          Save changes
        </Button>
      </div>
    </Modal>
  )
}

function seed(rows?: InvoiceLine[]): NewLine[] {
  if (!rows || rows.length === 0)
    return [{ description: '', quantity: 1, unit_price_cents: 0 }]
  return rows.map((r) => ({
    description: r.description,
    quantity: r.quantity,
    unit_price_cents: r.unit_price_cents,
  }))
}
