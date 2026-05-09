'use client'

import { useMemo, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { PageHeader } from '@/components/ui/EmptyState'
import { Input, Label, Select } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import type { AccountRow, AccountType, ScheduleCLine } from '@/lib/supabase/types'

const TYPE_ORDER: AccountType[] = [
  'asset',
  'liability',
  'equity',
  'income',
  'expense',
]
const TYPE_LABEL: Record<AccountType, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  income: 'Income',
  expense: 'Expenses',
}

const SCHEDULE_C_OPTIONS: Array<[ScheduleCLine | '', string]> = [
  ['', '— Not categorized —'],
  ['gross_receipts', 'Line 1 — Gross receipts'],
  ['returns_allowances', 'Line 2 — Returns and allowances'],
  ['cogs', 'Line 4 / Part III — COGS'],
  ['advertising', 'Line 8 — Advertising'],
  ['car_truck', 'Line 9 — Car & truck'],
  ['commissions_fees', 'Line 10 — Commissions & fees'],
  ['contract_labor', 'Line 11 — Contract labor'],
  ['depletion', 'Line 12 — Depletion'],
  ['depreciation', 'Line 13 — Depreciation'],
  ['employee_benefits', 'Line 14 — Employee benefits'],
  ['insurance', 'Line 15 — Insurance'],
  ['interest_mortgage', 'Line 16a — Interest (mortgage)'],
  ['interest_other', 'Line 16b — Interest (other)'],
  ['legal_professional', 'Line 17 — Legal & professional'],
  ['office', 'Line 18 — Office expense'],
  ['pension_profit', 'Line 19 — Pension & profit-sharing'],
  ['rent_lease_vehicle', 'Line 20a — Rent (vehicles, equipment)'],
  ['rent_lease_other', 'Line 20b — Rent (other property)'],
  ['repairs_maintenance', 'Line 21 — Repairs & maintenance'],
  ['supplies', 'Line 22 — Supplies'],
  ['taxes_licenses', 'Line 23 — Taxes & licenses'],
  ['travel', 'Line 24a — Travel'],
  ['meals', 'Line 24b — Meals (50%)'],
  ['utilities', 'Line 25 — Utilities'],
  ['wages', 'Line 26 — Wages'],
  ['other', 'Line 48 — Other expenses'],
]

const SCHEDULE_C_LABEL: Record<string, string> = {}
for (const [v, label] of SCHEDULE_C_OPTIONS) {
  if (v) SCHEDULE_C_LABEL[v] = label
}

interface Props {
  initialAccounts: AccountRow[]
  canEdit: boolean
  canReconcile: boolean
}

export default function AccountsClient({
  initialAccounts,
  canEdit,
  canReconcile,
}: Props) {
  const [accounts, setAccounts] = useState<AccountRow[]>(initialAccounts)
  const [reconciling, setReconciling] = useState<AccountRow | null>(null)

  const grouped = useMemo(() => {
    const m = new Map<AccountType, AccountRow[]>()
    for (const t of TYPE_ORDER) m.set(t, [])
    for (const a of accounts) m.get(a.type)?.push(a)
    return m
  }, [accounts])

  async function patchAccount(
    id: string,
    patch: { schedule_c_line?: ScheduleCLine | null },
  ) {
    try {
      const res = await api.patch<AccountRow>(
        `/api/finances/accounts/${id}`,
        patch,
      )
      const updated = res.data as AccountRow
      setAccounts((prev) => prev.map((a) => (a.id === id ? updated : a)))
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Update failed')
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Bookkeeping"
        title="Chart of accounts"
        subtitle="The categories every dollar flows through. Map each to a Schedule C line so the tax export is accountant-ready."
      />

      <div className="space-y-10">
        {TYPE_ORDER.map((type) => {
          const rows = grouped.get(type) ?? []
          if (rows.length === 0) return null
          const showsSchedC = type === 'income' || type === 'expense'
          const showsRecon = type === 'asset' || type === 'liability'
          return (
            <section key={type}>
              <h2 className="font-serif text-[1.2rem] mb-3">
                {TYPE_LABEL[type]}
              </h2>
              <div className="border border-hm-text/10 overflow-x-auto">
                <table className="w-full font-garamond text-[0.95rem]">
                  <thead>
                    <tr className="bg-hm-text/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav">
                      <th className="text-left px-4 py-3 w-24">Code</th>
                      <th className="text-left px-4 py-3">Name</th>
                      {showsSchedC ? (
                        <th className="text-left px-4 py-3 w-72">
                          Schedule C line
                        </th>
                      ) : null}
                      {showsRecon ? (
                        <th className="text-left px-4 py-3 w-64">
                          Reconciled through
                        </th>
                      ) : null}
                      <th className="text-left px-4 py-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id} className="border-t border-hm-text/10">
                        <td className="px-4 py-3 text-hm-nav">{a.code}</td>
                        <td className="px-4 py-3">{a.name}</td>
                        {showsSchedC ? (
                          <td className="px-4 py-3">
                            {canEdit ? (
                              <Select
                                value={a.schedule_c_line ?? ''}
                                onChange={(e) =>
                                  patchAccount(a.id, {
                                    schedule_c_line:
                                      (e.target.value as ScheduleCLine) || null,
                                  })
                                }
                              >
                                {SCHEDULE_C_OPTIONS.map(([v, label]) => (
                                  <option key={v || 'none'} value={v}>
                                    {label}
                                  </option>
                                ))}
                              </Select>
                            ) : (
                              <span className="text-hm-nav">
                                {a.schedule_c_line
                                  ? SCHEDULE_C_LABEL[a.schedule_c_line]
                                  : '—'}
                              </span>
                            )}
                          </td>
                        ) : null}
                        {showsRecon ? (
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={
                                canReconcile
                                  ? () => setReconciling(a)
                                  : undefined
                              }
                              className={[
                                'text-left',
                                canReconcile
                                  ? 'cursor-pointer hover:text-hm-text'
                                  : 'cursor-default',
                              ].join(' ')}
                            >
                              {a.last_reconciled_through_date ? (
                                <>
                                  <div>
                                    {formatDate(
                                      a.last_reconciled_through_date,
                                    )}
                                  </div>
                                  <div className="font-sans text-[9px] uppercase tracking-[0.2em] text-emerald-700">
                                    Reconciled
                                  </div>
                                </>
                              ) : (
                                <span className="font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav">
                                  {canReconcile ? 'Mark reconciled' : '—'}
                                </span>
                              )}
                            </button>
                          </td>
                        ) : null}
                        <td className="px-4 py-3 text-hm-nav">
                          {a.description ?? ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )
        })}
      </div>

      <Modal
        open={reconciling !== null}
        onClose={() => setReconciling(null)}
        title={
          reconciling ? `Reconcile · ${reconciling.name}` : ''
        }
        size="sm"
      >
        {reconciling ? (
          <ReconcileForm
            account={reconciling}
            onSaved={(updated) => {
              setAccounts((prev) =>
                prev.map((a) => (a.id === updated.id ? updated : a)),
              )
              setReconciling(null)
              toast.success('Reconciliation saved')
            }}
            onCancel={() => setReconciling(null)}
          />
        ) : null}
      </Modal>
    </div>
  )
}

function ReconcileForm({
  account,
  onSaved,
  onCancel,
}: {
  account: AccountRow
  onSaved: (updated: AccountRow) => void
  onCancel: () => void
}) {
  const [date, setDate] = useState(
    account.last_reconciled_through_date ??
      new Date().toISOString().slice(0, 10),
  )
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save(through: string | null) {
    setErr(null)
    setSubmitting(true)
    try {
      const res = await api.post<AccountRow>(
        `/api/finances/accounts/${account.id}/reconcile`,
        { through_date: through },
      )
      onSaved(res.data as AccountRow)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <p className="font-garamond text-[0.95rem] text-hm-nav leading-[1.6]">
        Mark this account as tied to your bank/CC statement through the date
        below. Use this when you&apos;ve matched every transaction up to that date.
      </p>
      <div>
        <Label htmlFor="rec-date">Reconciled through</Label>
        <Input
          id="rec-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>
      {err ? (
        <div className="font-garamond text-[0.95rem] text-red-700">{err}</div>
      ) : null}
      <div className="flex justify-between pt-2">
        {account.last_reconciled_through_date ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => save(null)}
            disabled={submitting}
          >
            Clear
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => save(date)}
            loading={submitting}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}
