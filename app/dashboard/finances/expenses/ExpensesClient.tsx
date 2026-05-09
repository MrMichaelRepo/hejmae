'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatCents, formatDate } from '@/lib/format'
import { PageHeader } from '@/components/ui/EmptyState'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import ExpenseModal from './ExpenseModal'
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
