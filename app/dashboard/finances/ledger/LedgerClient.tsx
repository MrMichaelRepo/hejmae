'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { formatCents, formatDate } from '@/lib/format'
import { PageHeader } from '@/components/ui/EmptyState'
import EmptyState from '@/components/ui/EmptyState'
import { Select, Label } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import ManualEntryModal from './ManualEntryModal'
import type {
  AccountRow,
  JournalEntryRow,
  JournalLineRow,
  ProjectRow,
} from '@/lib/supabase/types'

interface EntryWithLines extends JournalEntryRow {
  lines: JournalLineRow[]
}

export interface LedgerResponse {
  entries: EntryWithLines[]
  accounts: Pick<AccountRow, 'id' | 'code' | 'name' | 'type' | 'system_key'>[]
}

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  expense: 'Expense',
  mileage: 'Mileage',
  payment: 'Payment',
}

interface Props {
  initialData: LedgerResponse
  initialProjects: ProjectRow[]
  initialFullAccounts: AccountRow[]
}

export default function LedgerClient({
  initialData,
  initialProjects,
  initialFullAccounts,
}: Props) {
  const [data, setData] = useState<LedgerResponse>(initialData)
  const [projects] = useState<ProjectRow[]>(initialProjects)
  const [fullAccounts] = useState<AccountRow[]>(initialFullAccounts)
  const [accountFilter, setAccountFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const isInitial = useRef(true)

  const refresh = useCallback(async () => {
    const params = new URLSearchParams()
    if (accountFilter) params.set('account_id', accountFilter)
    if (sourceFilter) params.set('source_type', sourceFilter)
    const res = await api.get<LedgerResponse>(
      `/api/finances/ledger${params.toString() ? `?${params}` : ''}`,
    )
    setData(res.data as LedgerResponse)
  }, [accountFilter, sourceFilter])

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false
      return
    }
    refresh()
  }, [refresh])

  async function handleDelete(entryId: string) {
    if (!confirm('Delete this manual entry? This cannot be undone.')) return
    try {
      await api.del(`/api/finances/journal-entries/${entryId}`)
      await refresh()
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Delete failed')
    }
  }

  const accountIx = useMemo(() => {
    return new Map(data.accounts.map((a) => [a.id, a]))
  }, [data])

  return (
    <div>
      <PageHeader
        eyebrow="Bookkeeping"
        title="Ledger"
        subtitle="Every balanced journal entry, in date order. The source column links each entry back to the row that produced it."
        actions={
          <Button onClick={() => setCreating(true)}>New entry</Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 max-w-2xl">
        <div>
          <Label htmlFor="f-acct">Account</Label>
          <Select
            id="f-acct"
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
          >
            <option value="">All accounts</option>
            {data.accounts
              .slice()
              .sort((a, b) => a.code.localeCompare(b.code))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="f-src">Source</Label>
          <Select
            id="f-src"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="">All sources</option>
            <option value="payment">Payment</option>
            <option value="expense">Expense</option>
            <option value="mileage">Mileage</option>
            <option value="manual">Manual</option>
          </Select>
        </div>
      </div>

      {data.entries.length === 0 ? (
        <EmptyState
          title="No journal entries yet"
          body="Save an expense, log a trip, or receive a payment — entries will appear here."
          small
        />
      ) : (
        <div className="space-y-4">
          {data.entries.map((entry) => (
            <div
              key={entry.id}
              className="border border-hm-text/10 bg-bg"
            >
              <div className="flex items-baseline justify-between border-b border-hm-text/10 px-5 py-3">
                <div className="font-garamond text-[1.05rem]">
                  <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mr-3">
                    {formatDate(entry.entry_date)}
                  </span>
                  {entry.memo || (
                    <span className="text-hm-nav italic">No memo</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav">
                    {SOURCE_LABELS[entry.source_type] ?? entry.source_type}
                  </span>
                  {entry.source_type === 'manual' ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(entry.id)}
                      className="font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav hover:text-red-700"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
              <table className="w-full font-garamond text-[0.95rem]">
                <thead>
                  <tr className="font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav">
                    <th className="text-left px-5 py-2">Account</th>
                    <th className="text-left px-5 py-2">Memo</th>
                    <th className="text-right px-5 py-2">Debit</th>
                    <th className="text-right px-5 py-2">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.lines.map((l) => {
                    const a = accountIx.get(l.account_id)
                    const debit = l.amount_cents > 0 ? l.amount_cents : 0
                    const credit = l.amount_cents < 0 ? -l.amount_cents : 0
                    return (
                      <tr
                        key={l.id}
                        className="border-t border-hm-text/[0.06]"
                      >
                        <td className="px-5 py-2">
                          {a ? (
                            <>
                              <span className="text-hm-nav">{a.code}</span>{' '}
                              {a.name}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-5 py-2 text-hm-nav">
                          {l.memo ?? ''}
                        </td>
                        <td className="text-right px-5 py-2">
                          {debit ? formatCents(debit) : ''}
                        </td>
                        <td className="text-right px-5 py-2">
                          {credit ? formatCents(credit) : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <ManualEntryModal
        open={creating}
        onClose={() => setCreating(false)}
        accounts={fullAccounts}
        projects={projects}
        onSaved={async () => {
          setCreating(false)
          await refresh()
        }}
      />
    </div>
  )
}
