'use client'

import Modal from '@/components/ui/Modal'
import { formatCents, formatDate } from '@/lib/format'
import type { ExpenseRow } from '@/lib/supabase/types'

export default function ReceiptPreview({
  expense,
  onClose,
}: {
  expense: (ExpenseRow & { vendor_display?: string }) | null
  onClose: () => void
}) {
  const isPdf = expense?.receipt_content_type?.includes('pdf') ?? false
  return (
    <Modal
      open={expense !== null}
      onClose={onClose}
      title={
        expense
          ? `${expense.vendor_display || expense.vendor_name || 'Receipt'} · ${formatDate(expense.expense_date)} · ${formatCents(expense.amount_cents)}`
          : 'Receipt'
      }
      size="lg"
    >
      {expense?.receipt_url ? (
        isPdf ? (
          <iframe
            src={expense.receipt_url}
            className="w-full h-[70vh] border border-line"
            title="Receipt"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={expense.receipt_url}
            alt="Receipt"
            className="w-full max-h-[70vh] object-contain bg-ink/[0.02]"
          />
        )
      ) : (
        <div className="font-garamond text-[0.95rem] text-ink-muted italic">
          No receipt attached.
        </div>
      )}
      {expense?.receipt_url ? (
        <div className="mt-4">
          <a
            href={expense.receipt_url}
            target="_blank"
            rel="noreferrer"
            className="font-sans text-[10px] uppercase tracking-[0.2em] text-ink-muted hover:text-ink"
          >
            Open in new tab ↗
          </a>
        </div>
      ) : null}
    </Modal>
  )
}
