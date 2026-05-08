'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api, ApiError } from '@/lib/api'
import { formatCents, formatDate } from '@/lib/format'
import { PageHeader } from '@/components/ui/EmptyState'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { Input, Label, Select, Textarea } from '@/components/ui/Input'
import type {
  AccountRow,
  ExpenseRow,
  ProjectRow,
} from '@/lib/supabase/types'

interface ExpenseRowWithJoin extends ExpenseRow {
  category_name?: string
  payment_name?: string
  project_name?: string | null
}

interface Props {
  initialExpenses: ExpenseRow[]
  initialAccounts: AccountRow[]
  initialProjects: ProjectRow[]
}

export default function ExpensesClient({
  initialExpenses,
  initialAccounts,
  initialProjects,
}: Props) {
  const [expenses, setExpenses] = useState<ExpenseRow[]>(initialExpenses)
  const [accounts, setAccounts] = useState<AccountRow[]>(initialAccounts)
  const [projects, setProjects] = useState<ProjectRow[]>(initialProjects)
  const [creating, setCreating] = useState(false)

  async function refresh() {
    const [eRes, aRes, pRes] = await Promise.all([
      api.get<ExpenseRow[]>('/api/finances/expenses'),
      api.get<AccountRow[]>('/api/finances/accounts'),
      api.get<ProjectRow[]>('/api/projects'),
    ])
    setExpenses((eRes.data as ExpenseRow[]) ?? [])
    setAccounts((aRes.data as AccountRow[]) ?? [])
    setProjects((pRes.data as ProjectRow[]) ?? [])
  }

  const enriched = useMemo<ExpenseRowWithJoin[]>(() => {
    const accIx = new Map(accounts.map((a) => [a.id, a]))
    const projIx = new Map(projects.map((p) => [p.id, p]))
    return expenses.map((e) => ({
      ...e,
      category_name: accIx.get(e.category_account_id)?.name,
      payment_name: accIx.get(e.payment_account_id)?.name,
      project_name: e.project_id ? projIx.get(e.project_id)?.name ?? null : null,
    }))
  }, [expenses, accounts, projects])

  const total = enriched.reduce((a, e) => a + e.amount_cents, 0)

  return (
    <div>
      <PageHeader
        eyebrow="Bookkeeping"
        title="Expenses"
        subtitle="Every dollar out of the studio. Each expense posts a balanced journal entry the moment it's saved."
        actions={
          <Button onClick={() => setCreating(true)}>Add expense</Button>
        }
      />

      <div className="mb-6 font-garamond text-[0.95rem] text-hm-nav">
        {enriched.length} expense{enriched.length === 1 ? '' : 's'} ·{' '}
        <span className="text-hm-text">{formatCents(total)}</span> total
      </div>

      {enriched.length === 0 ? (
        <EmptyState
          title="No expenses yet"
          body="Software subscriptions, mileage reimbursements, samples, supplies — track them here and they roll into your studio P&L automatically."
          action={<Button onClick={() => setCreating(true)}>Add expense</Button>}
        />
      ) : (
        <div className="border border-hm-text/10 overflow-x-auto">
          <table className="w-full font-garamond text-[0.95rem]">
            <thead>
              <tr className="bg-hm-text/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav">
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Vendor</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-left px-4 py-3">Project</th>
                <th className="text-left px-4 py-3">Paid from</th>
                <th className="text-right px-4 py-3">Amount</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {enriched.map((e) => (
                <tr
                  key={e.id}
                  className="border-t border-hm-text/10 hover:bg-hm-text/[0.02]"
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDate(e.expense_date)}
                  </td>
                  <td className="px-4 py-3">
                    {e.vendor_name || (
                      <span className="text-hm-nav italic">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-hm-nav">{e.category_name}</td>
                  <td className="px-4 py-3">
                    {e.project_name ? (
                      <Link
                        href={`/dashboard/projects/${e.project_id}`}
                        className="text-hm-nav hover:text-hm-text"
                      >
                        {e.project_name}
                      </Link>
                    ) : (
                      <span className="text-hm-nav/40">Studio</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-hm-nav">{e.payment_name}</td>
                  <td className="text-right px-4 py-3">
                    {formatCents(e.amount_cents)}
                  </td>
                  <td className="text-right px-4 py-3">
                    {e.receipt_url ? (
                      <a
                        href={e.receipt_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav hover:text-hm-text"
                      >
                        Receipt
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ExpenseModal
        open={creating}
        onClose={() => setCreating(false)}
        accounts={accounts}
        projects={projects}
        onSaved={async () => {
          setCreating(false)
          await refresh()
        }}
      />
    </div>
  )
}

function ExpenseModal({
  open,
  onClose,
  accounts,
  projects,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  accounts: AccountRow[]
  projects: ProjectRow[]
  onSaved: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
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
    () =>
      accounts.filter(
        (a) => (a.type === 'asset' || a.type === 'liability') && a.is_active,
      ),
    [accounts],
  )

  // Sensible default selections. Vehicle Expense gets a sibling input on the
  // mileage page; here we default to the first non-vehicle expense.
  useEffect(() => {
    if (open) {
      setDate(today)
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
      // 1. Create the expense first so we have an id to scope the receipt.
      const create = await api.post<{ id: string }>(
        '/api/finances/expenses',
        {
          expense_date: date,
          vendor_name: vendor || null,
          description: description || null,
          amount_cents,
          category_account_id: categoryId,
          payment_account_id: paymentId,
          project_id: projectId || null,
          billable_to_client: billable,
        },
      )
      const expenseId = (create.data as { id: string }).id

      // 2. Upload the receipt (if any) and PATCH the URL onto the expense.
      if (receipt) {
        const fd = new FormData()
        fd.append('file', receipt)
        fd.append('expense_id', expenseId)
        const res = await fetch('/api/finances/receipts', {
          method: 'POST',
          body: fd,
        })
        if (!res.ok) {
          // Soft-fail: the expense saved fine; the user can re-upload.
          console.warn('[expense] receipt upload failed', await res.text())
        } else {
          const { data } = (await res.json()) as {
            data: { path: string; signedUrl: string; contentType: string }
          }
          // receipt_url is no longer persisted — the API re-signs from
          // receipt_path on every read. Only the path is canonical.
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
          <Label htmlFor="exp-vendor">Vendor</Label>
          <Input
            id="exp-vendor"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="e.g. Visual Comfort"
          />
        </div>

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
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={submitting}
          >
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
