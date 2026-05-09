'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { api, ApiError } from '@/lib/api'
import { formatCents, formatDate } from '@/lib/format'
import { PageHeader } from '@/components/ui/EmptyState'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'
import ExpenseModal from './ExpenseModal'
import ReceiptPreview from './ReceiptPreview'
import type {
  AccountRow,
  ExpenseRow,
  ProjectRow,
  VendorRow,
} from '@/lib/supabase/types'

interface ExpenseRowWithJoin extends ExpenseRow {
  category_name?: string
  payment_name?: string
  project_name?: string | null
  vendor_display?: string
}

interface Props {
  initialExpenses: ExpenseRow[]
  initialAccounts: AccountRow[]
  initialProjects: ProjectRow[]
  initialVendors: VendorRow[]
  canReconcile: boolean
}

export default function ExpensesClient({
  initialExpenses,
  initialAccounts,
  initialProjects,
  initialVendors,
  canReconcile,
}: Props) {
  const [expenses, setExpenses] = useState<ExpenseRow[]>(initialExpenses)
  const [accounts, setAccounts] = useState<AccountRow[]>(initialAccounts)
  const [projects, setProjects] = useState<ProjectRow[]>(initialProjects)
  const [vendors, setVendors] = useState<VendorRow[]>(initialVendors)
  const [creating, setCreating] = useState(false)
  const [previewing, setPreviewing] = useState<ExpenseRowWithJoin | null>(null)

  // Filters
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [paymentAcctId, setPaymentAcctId] = useState('')
  const [billableOnly, setBillableOnly] = useState(false)
  const [reconciledFilter, setReconciledFilter] = useState<'all' | 'reconciled' | 'unreconciled'>('all')

  async function refresh() {
    const [eRes, aRes, pRes, vRes] = await Promise.all([
      api.get<ExpenseRow[]>('/api/finances/expenses'),
      api.get<AccountRow[]>('/api/finances/accounts'),
      api.get<ProjectRow[]>('/api/projects'),
      api.get<VendorRow[]>('/api/vendors'),
    ])
    setExpenses((eRes.data as ExpenseRow[]) ?? [])
    setAccounts((aRes.data as AccountRow[]) ?? [])
    setProjects((pRes.data as ProjectRow[]) ?? [])
    setVendors((vRes.data as VendorRow[]) ?? [])
  }

  const enriched = useMemo<ExpenseRowWithJoin[]>(() => {
    const accIx = new Map(accounts.map((a) => [a.id, a]))
    const projIx = new Map(projects.map((p) => [p.id, p]))
    const venIx = new Map(vendors.map((v) => [v.id, v]))
    return expenses.map((e) => ({
      ...e,
      category_name: accIx.get(e.category_account_id)?.name,
      payment_name: accIx.get(e.payment_account_id)?.name,
      project_name: e.project_id ? projIx.get(e.project_id)?.name ?? null : null,
      vendor_display: e.vendor_id
        ? venIx.get(e.vendor_id)?.name ?? e.vendor_name ?? '—'
        : e.vendor_name ?? '',
    }))
  }, [expenses, accounts, projects, vendors])

  const filtered = useMemo(() => {
    return enriched.filter((e) => {
      if (from && e.expense_date < from) return false
      if (to && e.expense_date > to) return false
      if (categoryId && e.category_account_id !== categoryId) return false
      if (projectId === '__studio__' && e.project_id) return false
      else if (projectId && projectId !== '__studio__' && e.project_id !== projectId) return false
      if (paymentAcctId && e.payment_account_id !== paymentAcctId) return false
      if (billableOnly && !e.billable_to_client) return false
      if (reconciledFilter === 'reconciled' && !e.reconciled_at) return false
      if (reconciledFilter === 'unreconciled' && e.reconciled_at) return false
      return true
    })
  }, [enriched, from, to, categoryId, projectId, paymentAcctId, billableOnly, reconciledFilter])

  // Subtotals: by category, summed cents.
  const totalsByCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of filtered) {
      m.set(
        e.category_account_id,
        (m.get(e.category_account_id) ?? 0) + e.amount_cents,
      )
    }
    return m
  }, [filtered])

  const total = filtered.reduce((a, e) => a + e.amount_cents, 0)
  const billableTotal = filtered
    .filter((e) => e.billable_to_client)
    .reduce((a, e) => a + e.amount_cents, 0)
  const unreconciledTotal = filtered
    .filter((e) => !e.reconciled_at)
    .reduce((a, e) => a + e.amount_cents, 0)

  async function toggleReconciled(e: ExpenseRowWithJoin) {
    try {
      const res = await api.post<ExpenseRow>(
        `/api/finances/expenses/${e.id}/reconcile`,
        { reconciled: !e.reconciled_at },
      )
      const updated = res.data as ExpenseRow
      setExpenses((prev) => prev.map((x) => (x.id === e.id ? updated : x)))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed')
    }
  }

  function clearFilters() {
    setFrom('')
    setTo('')
    setCategoryId('')
    setProjectId('')
    setPaymentAcctId('')
    setBillableOnly(false)
    setReconciledFilter('all')
  }

  const expenseAccts = accounts.filter((a) => a.type === 'expense')
  const paymentAccts = accounts.filter(
    (a) => a.type === 'asset' || a.type === 'liability',
  )

  const filtersActive =
    from || to || categoryId || projectId || paymentAcctId || billableOnly || reconciledFilter !== 'all'

  const exportHref =
    '/api/finances/reports/expenses.csv?' +
    new URLSearchParams(
      Object.entries({
        from,
        to,
        category_id: categoryId,
        project_id: projectId,
        payment_account_id: paymentAcctId,
        billable: billableOnly ? 'true' : '',
      }).filter(([, v]) => v) as [string, string][],
    ).toString()

  return (
    <div>
      <PageHeader
        eyebrow="Bookkeeping"
        title="Expenses"
        subtitle="Every dollar out of the studio. Each expense posts a balanced journal entry the moment it's saved."
        actions={
          <div className="flex gap-3">
            <a href={exportHref} download>
              <Button variant="ghost">Export CSV</Button>
            </a>
            <Button onClick={() => setCreating(true)}>Add expense</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6 pb-6 border-b border-hm-text/10">
        <div className="md:col-span-1">
          <label className="block font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-1">
            From
          </label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="md:col-span-1">
          <label className="block font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-1">
            To
          </label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="md:col-span-1">
          <label className="block font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-1">
            Category
          </label>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">All</option>
            {expenseAccts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="md:col-span-1">
          <label className="block font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-1">
            Project
          </label>
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">All</option>
            <option value="__studio__">Studio (no project)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="md:col-span-1">
          <label className="block font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-1">
            Paid from
          </label>
          <Select
            value={paymentAcctId}
            onChange={(e) => setPaymentAcctId(e.target.value)}
          >
            <option value="">All</option>
            {paymentAccts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="md:col-span-1">
          <label className="block font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-1">
            Reconciled
          </label>
          <Select
            value={reconciledFilter}
            onChange={(e) =>
              setReconciledFilter(e.target.value as typeof reconciledFilter)
            }
          >
            <option value="all">All</option>
            <option value="reconciled">Reconciled</option>
            <option value="unreconciled">Unreconciled</option>
          </Select>
        </div>
        <div className="md:col-span-6 flex items-center gap-4">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={billableOnly}
              onChange={(e) => setBillableOnly(e.target.checked)}
            />
            <span className="font-garamond text-[0.95rem]">Billable to client only</span>
          </label>
          {filtersActive ? (
            <button
              type="button"
              onClick={clearFilters}
              className="font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav hover:text-hm-text"
            >
              Clear filters
            </button>
          ) : null}
          <div className="ml-auto flex gap-6 text-[0.95rem]">
            <Stat label="Count" value={String(filtered.length)} />
            <Stat label="Total" value={formatCents(total)} />
            <Stat label="Billable" value={formatCents(billableTotal)} />
            <Stat
              label="Unreconciled"
              value={formatCents(unreconciledTotal)}
              warn={unreconciledTotal > 0}
            />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={filtersActive ? 'No matching expenses' : 'No expenses yet'}
          body="Software subscriptions, mileage reimbursements, samples, supplies — track them here and they roll into your studio P&L automatically."
          action={
            filtersActive ? (
              <Button onClick={clearFilters} variant="ghost">
                Clear filters
              </Button>
            ) : (
              <Button onClick={() => setCreating(true)}>Add expense</Button>
            )
          }
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
                <th className="text-center px-4 py-3">Receipt</th>
                <th className="text-center px-4 py-3">Recon</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr
                  key={e.id}
                  className="border-t border-hm-text/10 hover:bg-hm-text/[0.02]"
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDate(e.expense_date)}
                  </td>
                  <td className="px-4 py-3">
                    {e.vendor_display || (
                      <span className="text-hm-nav italic">—</span>
                    )}
                    {e.billable_to_client ? (
                      <span className="ml-2 font-sans text-[9px] uppercase tracking-[0.2em] text-emerald-700">
                        billable
                      </span>
                    ) : null}
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
                  <td className="text-center px-4 py-3">
                    {e.receipt_url ? (
                      <button
                        type="button"
                        onClick={() => setPreviewing(e)}
                        className="font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav hover:text-hm-text"
                      >
                        View
                      </button>
                    ) : (
                      <span className="text-hm-nav/40">—</span>
                    )}
                  </td>
                  <td className="text-center px-4 py-3">
                    {canReconcile ? (
                      <button
                        type="button"
                        onClick={() => toggleReconciled(e)}
                        title={
                          e.reconciled_at
                            ? `Reconciled ${formatDate(e.reconciled_at)}`
                            : 'Mark reconciled'
                        }
                        className={[
                          'font-sans text-[14px] hover:text-hm-text',
                          e.reconciled_at
                            ? 'text-emerald-700'
                            : 'text-hm-nav/40',
                        ].join(' ')}
                      >
                        {e.reconciled_at ? '✓' : '○'}
                      </button>
                    ) : (
                      <span
                        className={[
                          'font-sans text-[14px]',
                          e.reconciled_at
                            ? 'text-emerald-700'
                            : 'text-hm-nav/40',
                        ].join(' ')}
                      >
                        {e.reconciled_at ? '✓' : '○'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalsByCategory.size > 0 ? (
        <div className="mt-8">
          <h2 className="font-serif text-[1.2rem] leading-tight mb-3">
            By category (filtered)
          </h2>
          <div className="border border-hm-text/10 overflow-x-auto">
            <table className="w-full font-garamond text-[0.95rem]">
              <tbody>
                {Array.from(totalsByCategory.entries())
                  .map(([accId, amt]) => ({
                    acc: accounts.find((a) => a.id === accId),
                    amt,
                  }))
                  .filter((r) => r.acc)
                  .sort((a, b) => b.amt - a.amt)
                  .map((r) => (
                    <tr key={r.acc!.id} className="border-t border-hm-text/10">
                      <td className="px-4 py-2 text-hm-nav w-24">
                        {r.acc!.code}
                      </td>
                      <td className="px-4 py-2">{r.acc!.name}</td>
                      <td className="text-right px-4 py-2">
                        {formatCents(r.amt)}
                      </td>
                    </tr>
                  ))}
                <tr className="border-t border-hm-text/30 font-sans text-[10px] uppercase tracking-[0.18em]">
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2">Total</td>
                  <td className="text-right px-4 py-2">{formatCents(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <ExpenseModal
        open={creating}
        onClose={() => setCreating(false)}
        accounts={accounts}
        projects={projects}
        vendors={vendors}
        onSaved={async () => {
          setCreating(false)
          await refresh()
        }}
      />

      <ReceiptPreview
        expense={previewing}
        onClose={() => setPreviewing(null)}
      />
    </div>
  )
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string
  value: string
  warn?: boolean
}) {
  return (
    <div>
      <div className="font-sans text-[9px] uppercase tracking-[0.22em] text-hm-nav">
        {label}
      </div>
      <div
        className={[
          'font-serif text-[1rem] leading-none mt-1',
          warn ? 'text-amber-800' : '',
        ].join(' ')}
      >
        {value}
      </div>
    </div>
  )
}
