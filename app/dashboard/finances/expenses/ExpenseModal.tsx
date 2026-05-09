'use client'

import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { Input, Label, Select, Textarea } from '@/components/ui/Input'
import type { AccountRow, ProjectRow, VendorRow } from '@/lib/supabase/types'

interface Props {
  open: boolean
  onClose: () => void
  accounts: AccountRow[]
  projects: ProjectRow[]
  vendors: VendorRow[]
  onSaved: () => void
}

export default function ExpenseModal({ open, onClose, accounts, projects, vendors, onSaved }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [vendorId, setVendorId] = useState('')
  const [vendor, setVendor] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [paymentId, setPaymentId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [billable, setBillable] = useState(false)
  const [receipt, setReceipt] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const categoryAccts = useMemo(
    () => accounts.filter((a) => a.type === 'expense' && a.is_active),
    [accounts],
  )
  const paymentAccts = useMemo(
    () => accounts.filter((a) => (a.type === 'asset' || a.type === 'liability') && a.is_active),
    [accounts],
  )

  // Sensible default selections. Vehicle Expense gets a sibling input on the
  // mileage page; here we default to the first non-vehicle expense.
  useEffect(() => {
    if (open) {
      setDate(today)
      setVendorId('')
      setVendor('')
      setDescription('')
      setAmount('')
      setProjectId('')
      setBillable(false)
      setReceipt(null)
      setErr(null)
      setCategoryId(
        categoryAccts.find((a) => a.system_key === 'office_expense')?.id ??
          categoryAccts[0]?.id ??
          '',
      )
      setPaymentId(
        paymentAccts.find((a) => a.system_key === 'bank')?.id ??
          paymentAccts[0]?.id ??
          '',
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    const amountFloat = Number(amount)
    if (!Number.isFinite(amountFloat) || amountFloat <= 0) {
      setErr('Enter an amount greater than zero.')
      return
    }
    const amount_cents = Math.round(amountFloat * 100)

    setSubmitting(true)
    try {
      const selectedVendor = vendorId ? vendors.find((v) => v.id === vendorId) : null
      const create = await api.post<{ id: string }>('/api/finances/expenses', {
        expense_date: date,
        vendor_id: vendorId || null,
        // If a vendor was picked, use its name as a backstop on vendor_name
        // (lets free-text search keep working even if the vendor is later
        // unlinked).
        vendor_name: selectedVendor?.name ?? (vendor || null),
        description: description || null,
        amount_cents,
        category_account_id: categoryId,
        payment_account_id: paymentId,
        project_id: projectId || null,
        billable_to_client: billable,
      })
      const expenseId = (create.data as { id: string }).id

      if (receipt) {
        const fd = new FormData()
        fd.append('file', receipt)
        fd.append('expense_id', expenseId)
        const res = await fetch('/api/finances/receipts', { method: 'POST', body: fd })
        if (!res.ok) {
          console.warn('[expense] receipt upload failed', await res.text())
        } else {
          const { data } = (await res.json()) as {
            data: { path: string; signedUrl: string; contentType: string }
          }
          await api.patch(`/api/finances/expenses/${expenseId}`, {
            receipt_path: data.path,
            receipt_content_type: data.contentType,
          })
        }
      }

      onSaved()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to save expense')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add expense" size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="exp-date">Date</Label>
            <Input
              id="exp-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="exp-amount">Amount (USD)</Label>
            <Input
              id="exp-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <Label htmlFor="exp-vendor-id">Vendor</Label>
          <Select
            id="exp-vendor-id"
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
          >
            <option value="">— Free text below —</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.is_1099_eligible ? ' · 1099' : ''}
              </option>
            ))}
          </Select>
        </div>

        {!vendorId ? (
          <div>
            <Label htmlFor="exp-vendor">Vendor name (free text)</Label>
            <Input
              id="exp-vendor"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="e.g. Visual Comfort"
            />
            <div className="mt-1.5 font-garamond text-[0.85rem] text-hm-nav/70">
              Pick a vendor above to count toward 1099 totals.
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="exp-cat">Category</Label>
            <Select
              id="exp-cat"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
            >
              {categoryAccts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="exp-pay">Paid from</Label>
            <Select
              id="exp-pay"
              value={paymentId}
              onChange={(e) => setPaymentId(e.target.value)}
              required
            >
              {paymentAccts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="exp-proj">Project (optional)</Label>
          <Select
            id="exp-proj"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">— Studio overhead (no project) —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="exp-desc">Description</Label>
          <Textarea
            id="exp-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional notes that show up on the journal entry."
          />
        </div>

        <div>
          <Label htmlFor="exp-receipt">Receipt</Label>
          <input
            id="exp-receipt"
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
            className="font-garamond text-[0.95rem]"
          />
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={billable}
            onChange={(e) => setBillable(e.target.checked)}
          />
          <span className="font-garamond text-[0.95rem]">
            Billable to client (reimbursable)
          </span>
        </label>

        {err ? (
          <div className="font-garamond text-[0.95rem] text-red-700">{err}</div>
        ) : null}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Save expense
          </Button>
        </div>
      </form>
    </Modal>
  )
}
