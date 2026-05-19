'use client'

// Refund modal — issues a Stripe refund on the designer's connected account.
// Default amount = current refundable balance (paid - already_refunded).

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'
import { api } from '@/lib/api'
import { formatCents } from '@/lib/format'
import type { Invoice, Payment } from '@/lib/types-ui'

interface Props {
  open: boolean
  projectId: string
  invoice: Invoice & { payments?: Payment[] }
  onClose: () => void
  onRefunded: () => void
}

export default function RefundModal({
  open,
  projectId,
  invoice,
  onClose,
  onRefunded,
}: Props) {
  const refundable =
    (invoice.payments ?? []).reduce((a, p) => a + p.amount_cents, 0) -
    (invoice.refunded_cents ?? 0)
  const [dollars, setDollars] = useState((refundable / 100).toFixed(2))
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setDollars((refundable / 100).toFixed(2))
      setReason('')
    }
  }, [open, refundable])

  const amountCents = Math.round(Number(dollars || 0) * 100)
  const isPartial = amountCents > 0 && amountCents < refundable
  const isFull = amountCents === refundable

  const submit = async () => {
    if (!amountCents || amountCents < 1) {
      toast.error('Enter a positive amount')
      return
    }
    if (amountCents > refundable) {
      toast.error(`Max refundable is ${formatCents(refundable)}`)
      return
    }
    setSubmitting(true)
    try {
      await api.post(`/api/projects/${projectId}/invoices/${invoice.id}/refund`, {
        amount_cents: amountCents,
        reason: reason.trim() || null,
      })
      toast.success('Refund initiated')
      onRefunded()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Refund payment" size="md">
      <div className="mb-5 border border-hm-text/10 bg-hm-text/[0.02] px-4 py-3 font-garamond text-[0.95rem]">
        <div className="text-hm-nav text-[0.85rem]">Refundable balance</div>
        <div className="font-serif text-[1.2rem]">{formatCents(refundable)}</div>
      </div>

      <Field label="Amount (USD)">
        <Input
          value={dollars}
          onChange={(e) => setDollars(e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
        />
      </Field>

      {amountCents > 0 ? (
        <div className="-mt-3 mb-5 font-garamond text-[0.85rem] text-hm-nav">
          {isFull ? 'Full refund' : isPartial ? 'Partial refund' : null}
        </div>
      ) : null}

      <Field label="Reason (internal note, optional)">
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Client cancelled before kickoff…"
        />
      </Field>

      <p className="mb-5 font-garamond text-[0.85rem] text-hm-nav/80">
        The refund goes through Stripe on your connected account. Bookkeeping
        and the client portal update automatically when Stripe confirms.
      </p>

      <div className="flex justify-end gap-3 border-t border-hm-text/10 pt-5">
        <Button variant="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} loading={submitting}>
          Refund {formatCents(amountCents)}
        </Button>
      </div>
    </Modal>
  )
}
