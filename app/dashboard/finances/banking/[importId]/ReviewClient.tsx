'use client'

// Per-import review screen. One row per parsed bank txn; the AI's proposed
// match (if any) is shown inline with confidence and reasoning. Actions:
//   * Accept     — confirm the proposal; row is hard-linked.
//   * Reject     — drop the proposal (re-run AI to try again).
//   * Ignore     — mark "not in books" (internal transfer, etc.).
//   * New expense — open a small form to spawn a fresh expense from the row.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'
import { formatCents } from '@/lib/format'
import type {
  AccountRow,
  BankStatementImportRow,
  BankTransactionRow,
  VendorRow,
} from '@/lib/supabase/types'

interface ProposedExpense {
  id: string
  expense_date: string
  vendor_name: string | null
  description: string | null
  amount_cents: number
}
interface ProposedPayment {
  id: string
  received_at: string
  amount_cents: number
  invoice_id: string
}
interface DetailResponse {
  import: BankStatementImportRow
  transactions: BankTransactionRow[]
  proposed: {
    expenses: ProposedExpense[]
    payments: ProposedPayment[]
  }
}

export default function ReviewClient({
  importRow,
  accounts,
  vendors,
}: {
  importRow: BankStatementImportRow
  accounts: AccountRow[]
  vendors: Pick<VendorRow, 'id' | 'name'>[]
}) {
  const [data, setData] = useState<DetailResponse | null>(null)
  const [polling, setPolling] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api.get<DetailResponse>(
        `/api/finances/bank-imports/${importRow.id}`,
      )
      setData(((res as { data?: DetailResponse }).data ?? res) as DetailResponse)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }, [importRow.id])

  useEffect(() => {
    void load()
  }, [load])

  // Poll while AI matching is in progress.
  useEffect(() => {
    if (!data) return
    const status = data.import.status
    if (status !== 'matching' && status !== 'parsed') return
    setPolling(true)
    const t = setInterval(() => {
      void load()
    }, 3000)
    return () => {
      clearInterval(t)
      setPolling(false)
    }
  }, [data, load])

  const rerunMatch = async () => {
    try {
      await api.post(`/api/finances/bank-imports/${importRow.id}/match`)
      toast.success('Re-running AI match')
      void load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const act = async (
    txnId: string,
    action: 'accept' | 'reject' | 'ignore',
  ) => {
    setBusyId(txnId)
    try {
      await api.patch(`/api/finances/bank-transactions/${txnId}`, { action })
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  if (!data) {
    return (
      <div className="font-garamond text-ink-muted">Loading…</div>
    )
  }

  const expenseById = new Map(
    data.proposed.expenses.map((e) => [e.id, e]),
  )
  const paymentById = new Map(
    data.proposed.payments.map((p) => [p.id, p]),
  )

  return (
    <div>
      <PageHeader
        eyebrow="Finances · Banking"
        title="Review matches"
        subtitle={`${importRow.filename} — ${importRow.row_count} rows, ${importRow.matched_count} proposed matches.`}
        actions={
          <div className="flex gap-2">
            <Link
              href="/dashboard/finances/banking"
              className="font-sans text-[10px] uppercase tracking-[0.22em] border border-line-strong px-4 py-2 hover:bg-ink hover:text-bg transition-colors"
            >
              ← All imports
            </Link>
            <Button variant="secondary" onClick={rerunMatch}>
              Re-run AI match
            </Button>
          </div>
        }
      />

      {data.import.status === 'matching' || polling ? (
        <div className="mb-4 p-3 border border-accent/30 bg-accent-soft/30 font-garamond text-[0.9rem]">
          AI matching in progress…
        </div>
      ) : null}
      {data.import.ai_error ? (
        <div className="mb-4 p-3 border border-warn/40 bg-warn-soft/40 font-garamond text-[0.9rem] text-warn">
          Last AI run failed: {data.import.ai_error}
        </div>
      ) : null}

      <div className="border border-line overflow-x-auto">
        <table className="w-full font-garamond text-[0.92rem]">
          <thead>
            <tr className="bg-ink/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted">
              <th className="text-left px-3 py-2 w-24">Date</th>
              <th className="text-left px-3 py-2">Description</th>
              <th className="text-right px-3 py-2 w-24">Amount</th>
              <th className="text-left px-3 py-2 w-[28rem]">Proposal</th>
              <th className="text-left px-3 py-2 w-[12rem]">Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.transactions.map((t) => {
              const proposed =
                t.proposed_entity_type === 'expense' && t.proposed_entity_id
                  ? expenseById.get(t.proposed_entity_id)
                  : t.proposed_entity_type === 'payment' && t.proposed_entity_id
                    ? paymentById.get(t.proposed_entity_id)
                    : null
              return (
                <tr key={t.id} className="border-t border-line align-top">
                  <td className="px-3 py-3 text-ink-muted whitespace-nowrap">
                    {t.txn_date}
                  </td>
                  <td className="px-3 py-3 break-words max-w-md">
                    {t.description}
                  </td>
                  <td
                    className={`text-right px-3 py-3 whitespace-nowrap ${t.amount_cents >= 0 ? 'text-success' : 'text-warn'}`}
                  >
                    {formatCents(t.amount_cents)}
                  </td>
                  <td className="px-3 py-3">
                    {t.status === 'ignored' ? (
                      <span className="text-ink-muted italic">Ignored</span>
                    ) : proposed ? (
                      <div className="space-y-1">
                        <div className="font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                          {t.proposed_entity_type} ·{' '}
                          {Math.round((t.proposed_confidence ?? 0) * 100)}% conf
                        </div>
                        {t.proposed_entity_type === 'expense' &&
                        proposed &&
                        'expense_date' in proposed ? (
                          <div>
                            {proposed.vendor_name ?? 'Expense'}{' '}
                            <span className="text-ink-muted">
                              · {proposed.expense_date} ·{' '}
                              {formatCents(proposed.amount_cents)}
                            </span>
                          </div>
                        ) : null}
                        {t.proposed_entity_type === 'payment' &&
                        proposed &&
                        'received_at' in proposed ? (
                          <div>
                            Payment{' '}
                            <span className="text-ink-muted">
                              · {proposed.received_at.slice(0, 10)} ·{' '}
                              {formatCents(proposed.amount_cents)}
                            </span>
                          </div>
                        ) : null}
                        {t.proposed_reasoning ? (
                          <div className="text-ink-muted text-[0.85rem]">
                            {t.proposed_reasoning}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-ink-muted italic">No match found</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill status={t.status} />
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {t.status === 'pending' && t.proposed_entity_id ? (
                      <div className="flex gap-1">
                        <Button
                          variant="primary"
                          onClick={() => act(t.id, 'accept')}
                          loading={busyId === t.id}
                        >
                          Accept
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => act(t.id, 'reject')}
                          loading={busyId === t.id}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : t.status === 'pending' && t.amount_cents < 0 ? (
                      <div className="flex gap-1">
                        <Button
                          variant="secondary"
                          onClick={() => setCreateOpen(t.id)}
                        >
                          New expense
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => act(t.id, 'ignore')}
                        >
                          Ignore
                        </Button>
                      </div>
                    ) : t.status === 'pending' ? (
                      <Button variant="ghost" onClick={() => act(t.id, 'ignore')}>
                        Ignore
                      </Button>
                    ) : null}

                    {createOpen === t.id ? (
                      <CreateExpenseForm
                        txn={t}
                        accounts={accounts}
                        vendors={vendors}
                        onCancel={() => setCreateOpen(null)}
                        onDone={async () => {
                          setCreateOpen(null)
                          await load()
                        }}
                      />
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: BankTransactionRow['status'] }) {
  const map: Record<BankTransactionRow['status'], string> = {
    pending: 'text-ink-muted border-line',
    matched: 'text-success border-success/30',
    created_expense: 'text-success border-success/30',
    created_payment: 'text-success border-success/30',
    ignored: 'text-ink-muted border-line',
    split: 'text-ink-muted border-line',
  }
  return (
    <span
      className={`font-sans text-[10px] uppercase tracking-[0.18em] border px-2 py-0.5 ${map[status]}`}
    >
      {status.replace('_', ' ')}
    </span>
  )
}

function CreateExpenseForm({
  txn,
  accounts,
  vendors,
  onCancel,
  onDone,
}: {
  txn: BankTransactionRow
  accounts: AccountRow[]
  vendors: Pick<VendorRow, 'id' | 'name'>[]
  onCancel: () => void
  onDone: () => Promise<void>
}) {
  const expenseAccounts = accounts.filter((a) => a.type === 'expense')
  const paymentAccounts = accounts.filter(
    (a) => a.type === 'asset' || a.type === 'liability',
  )
  const [categoryId, setCategoryId] = useState(expenseAccounts[0]?.id ?? '')
  const [paymentAcctId, setPaymentAcctId] = useState(
    paymentAccounts[0]?.id ?? '',
  )
  const [vendorId, setVendorId] = useState<string>('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!categoryId || !paymentAcctId) {
      toast.error('Pick a category and a payment account.')
      return
    }
    setBusy(true)
    try {
      await api.patch(`/api/finances/bank-transactions/${txn.id}`, {
        action: 'create_expense',
        category_account_id: categoryId,
        payment_account_id: paymentAcctId,
        vendor_id: vendorId || null,
      })
      toast.success('Expense created')
      await onDone()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 p-3 border border-line-strong bg-bg space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">— Category —</option>
          {expenseAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} · {a.name}
            </option>
          ))}
        </Select>
        <Select
          value={paymentAcctId}
          onChange={(e) => setPaymentAcctId(e.target.value)}
        >
          <option value="">— Paid from —</option>
          {paymentAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} · {a.name}
            </option>
          ))}
        </Select>
        <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
          <option value="">— No vendor —</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex gap-2">
        <Button variant="primary" onClick={submit} loading={busy}>
          Create
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
