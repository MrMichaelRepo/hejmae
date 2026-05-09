'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { formatCents, formatDate } from '@/lib/format'
import { PageHeader } from '@/components/ui/EmptyState'
import EmptyState from '@/components/ui/EmptyState'
import { Input, Label, Select } from '@/components/ui/Input'
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
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const isInitial = useRef(true)

  const refresh = useCallback(async () => {
    const params = new URLSearchParams()
    if (accountFilter) params.set('account_id', accountFilter)
    if (sourceFilter) params.set('source_type', sourceFilter)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    const res = await api.get<LedgerResponse>(
      `/api/finances/ledger${params.toString() ? `?${params}` : ''}`,
    )
    setData(res.data as LedgerResponse)
  }, [accountFilter, sourceFilter, from, to])

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

  const accountIx = useMemo(
    () => new Map(data.accounts.map((a) => [a.id, a])),
    [data],
  )

  // When an account filter is active, compute a running balance per entry.
  // Entries are returned newest-first, so we walk them in reverse to
  // accumulate from oldest -> newest.
  const entriesWithBalance = useMemo(() => {
    if (!accountFilter) {
      return data.entries.map((e) => ({ ...e, running_balance: null as number | null }))
    }
    const reversed = [...data.entries].reverse()
    let running = 0
    const balanceById = new Map<string, number>()
    for (const e of reversed) {
      const delta = e.lines
        .filter((l) => l.account_id === accountFilter)
        .reduce((a, l) => a + l.amount_cents, 0)
      running += delta
      balanceById.set(e.id, running)
    }
    return data.entries.map((e) => ({
      ...e,
      running_balance: balanceById.get(e.id) ?? null,
    }))
  }, [data, accountFilter])

  const exportHref =
    '/api/finances/reports/general-ledger.csv?' +
    new URLSearchParams(
      Object.entries({
        account_id: accountFilter,
        source_type: sourceFilter,
        from,
        to,
      }).filter(([, v]) => v) as [string, string][],
    ).toString()

  return (
    <div>
      <PageHeader
        eyebrow="Bookkeeping"
        title="General ledger"
        subtitle="Every balanced journal entry, in date order. Filter to an account to see a running balance."
        actions={
          <div className="flex gap-3">
            <a href={exportHref} download>
              <Button variant="ghost">Export CSV</Button>
            </a>
            <Button onClick={() => setCreating(true)}>New entry</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 pb-6 border-b border-hm-text/10">
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
        <div>
          <Label htmlFor="f-from">From</Label>
          <Input
            id="f-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="f-to">To</Label>
          <Input
            id="f-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>

      {data.entries.length === 0 ? (
        <EmptyState
          title="No journal entries yet"
          body="Save an expense, log a trip, or receive a payment — entries will appear here."
          small
        />
      ) : (
        <div className="border border-hm-text/10 overflow-x-auto">
          <table className="w-full font-garamond text-[0.95rem]">
            <thead>
              <tr className="bg-hm-text/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav">
                <th className="text-left px-4 py-3 w-28">Date</th>
                <th className="text-left px-4 py-3 w-24">Source</th>
                <th className="text-left px-4 py-3">Memo / Accounts</th>
                <th className="text-right px-4 py-3">Debit</th>
                <th className="text-right px-4 py-3">Credit</th>
                {accountFilter ? (
                  <th className="text-right px-4 py-3 w-32">Balance</th>
                ) : null}
                <th className="px-4 py-3 w-12" />
              </tr>
            </thead>
            <tbody>
              {entriesWithBalance.map((entry) => {
                const isOpen = expanded === entry.id
                const debits = entry.lines
                  .filter((l) => l.amount_cents > 0)
                  .reduce((a, l) => a + l.amount_cents, 0)
                const accountSummary = entry.lines
                  .map((l) => accountIx.get(l.account_id)?.name)
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <>
                    <tr
                      key={entry.id}
                      onClick={() => setExpanded(isOpen ? null : entry.id)}
                      className="border-t border-hm-text/10 hover:bg-hm-text/[0.02] cursor-pointer"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatDate(entry.entry_date)}
                      </td>
                      <td className="px-4 py-3 text-hm-nav font-sans text-[10px] uppercase tracking-[0.18em]">
                        {SOURCE_LABELS[entry.source_type] ?? entry.source_type}
                      </td>
                      <td className="px-4 py-3">
                        {entry.memo || (
                          <span className="text-hm-nav italic">No memo</span>
                        )}
                        <div className="text-hm-nav text-[0.85rem] mt-0.5">
                          {accountSummary}
                        </div>
                      </td>
                      <td className="text-right px-4 py-3">
                        {formatCents(debits)}
                      </td>
                      <td className="text-right px-4 py-3 text-hm-nav">
                        {formatCents(debits)}
                      </td>
                      {accountFilter ? (
                        <td className="text-right px-4 py-3">
                          {entry.running_balance != null
                            ? formatCents(entry.running_balance)
                            : '—'}
                        </td>
                      ) : null}
                      <td className="text-right px-4 py-3 text-hm-nav">
                        {isOpen ? '−' : '+'}
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr key={`${entry.id}-detail`}>
                        <td
                          colSpan={accountFilter ? 7 : 6}
                          className="bg-hm-text/[0.02] px-4 py-3"
                        >
                          <table className="w-full font-garamond text-[0.9rem]">
                            <thead>
                              <tr className="font-sans text-[9px] uppercase tracking-[0.18em] text-hm-nav">
                                <th className="text-left py-1">Account</th>
                                <th className="text-left py-1">Memo</th>
                                <th className="text-right py-1">Debit</th>
                                <th className="text-right py-1">Credit</th>
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
                                    className="border-t border-hm-text/10"
                                  >
                                    <td className="py-1.5">
                                      {a ? (
                                        <>
                                          <span className="text-hm-nav">{a.code}</span>{' '}
                                          {a.name}
                                        </>
                                      ) : (
                                        '—'
                                      )}
                                    </td>
                                    <td className="py-1.5 text-hm-nav">
                                      {l.memo ?? ''}
                                    </td>
                                    <td className="text-right py-1.5">
                                      {debit ? formatCents(debit) : ''}
                                    </td>
                                    <td className="text-right py-1.5">
                                      {credit ? formatCents(credit) : ''}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                          {entry.source_type === 'manual' ? (
                            <div className="text-right mt-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDelete(entry.id)
                                }}
                                className="font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav hover:text-red-700"
                              >
                                Delete entry
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </>
                )
              })}
            </tbody>
          </table>
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
