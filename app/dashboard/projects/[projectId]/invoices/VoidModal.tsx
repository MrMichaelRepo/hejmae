'use client'

// Void modal — flips status to 'void' and revokes the magic link. Requires
// a written reason for the audit trail.

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Field, Textarea } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'
import { api } from '@/lib/api'
import type { Invoice } from '@/lib/types-ui'

interface Props {
  open: boolean
  projectId: string
  invoice: Invoice
  onClose: () => void
  onVoided: () => void
}

export default function VoidModal({
  open,
  projectId,
  invoice,
  onClose,
  onVoided,
}: Props) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  const submit = async () => {
    if (!reason.trim()) {
      toast.error('Reason is required')
      return
    }
    setSubmitting(true)
    try {
      await api.post(`/api/projects/${projectId}/invoices/${invoice.id}/void`, {
        reason: reason.trim(),
      })
      toast.success('Invoice voided')
      onVoided()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Void invoice" size="md">
      <p className="mb-5 font-garamond text-[0.95rem] text-ink-muted">
        Voiding marks the invoice as cancelled and revokes the client&apos;s
        pay link. This action can&apos;t be undone — to re-bill, create a
        fresh invoice.
      </p>
      <Field label="Reason">
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="Why is this being voided? (logged for audit)"
        />
      </Field>
      <div className="flex justify-end gap-3 border-t border-line pt-5">
        <Button variant="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="danger" onClick={submit} loading={submitting}>
          Void invoice
        </Button>
      </div>
    </Modal>
  )
}
