'use client'

import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { formatCents } from '@/lib/format'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Input, Label, Select, Textarea } from '@/components/ui/Input'
import type { AccountRow, ProjectRow } from '@/lib/supabase/types'

// Each editor row is a single side of the entry: pick an account, enter
// either a debit or a credit. We store the signed cents internally
// (positive=debit, negative=credit) so the running balance is just sum().
interface DraftLine {
  key: string
  account_id: string
  // Strings while typing; we parse to integer cents on submit.
  debit: string
  credit: string
  project_id: string
  memo: string
}

function emptyLine(): DraftLine {
  return {
    key: Math.random().toString(36).slice(2),
    account_id: '',
    debit: '',
    credit: '',
    project_id: '',
    memo: '',
  }
}

function lineCents(l: DraftLine): number {
  // Debit and credit are mutually exclusive; if both are entered the
  // debit wins (the UI clears the other side on focus).
  const d = Number(l.debit)
  const c = Number(l.credit)
  if (Number.isFinite(d) && d > 0) return Math.round(d * 100)
  if (Number.isFinite(c) && c > 0) return -Math.round(c * 100)
  return 0
}

export default function ManualEntryModal({
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
  const [memo, setMemo] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setDate(today)
      setMemo('')
      setLines([emptyLine(), emptyLine()])
      setErr(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const sortedAccounts = useMemo(
    () =>
      accounts
        .filter((a) => a.is_active)
        .slice()
        .sort((a, b) => a.code.localeCompare(b.code)),
    [accounts],
  )

  const totalCents = lines.reduce((a, l) => a + lineCents(l), 0)
  const totalDebits = lines.reduce(
    (a, l) => a + (lineCents(l) > 0 ? lineCents(l) : 0),
    0,
  )
  const totalCredits = lines.reduce(
    (a, l) => a + (lineCents(l) < 0 ? -lineCents(l) : 0),
    0,
  )
  const balanced = totalCents === 0 && totalDebits > 0

  function update(idx: number, patch: Partial<DraftLine>) {
    setLines((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    )
  }
  function addLine() {
    setLines((r) => [...r, emptyLine()])
  }
  function removeLine(idx: number) {
    setLines((rows) =>
      rows.length <= 2 ? rows : rows.filter((_, i) => i !== idx),
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!balanced) {
      setErr('Debits must equal credits before saving.')
      return
    }
    const payloadLines = lines
      .map((l) => ({
        account_id: l.account_id,
        amount_cents: lineCents(l),
        project_id: l.project_id || null,
        memo: l.memo || null,
      }))
      .filter((l) => l.amount_cents !== 0 && l.account_id)

    if (payloadLines.length < 2) {
      setErr('Add at least two lines with an account and an amount.')
      return
    }

    setSubmitting(true)
    try {
      await api.post('/api/finances/journal-entries', {
        entry_date: date,
        memo: memo || null,
        lines: payloadLines,
      })
      onSaved()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to save entry')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New journal entry" size="xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="je-date">Date</Label>
            <Input
              id="je-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="col-span-2">
            <Label htmlFor="je-memo">Memo</Label>
            <Input
              id="je-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="e.g. Owner contribution to fund Q2 inventory"
            />
          </div>
        </div>

        <div className="border border-hm-text/10">
          <table className="w-full font-garamond text-[0.95rem]">
            <thead>
              <tr className="bg-hm-text/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav">
                <th className="text-left px-3 py-2">Account</th>
                <th className="text-left px-3 py-2 w-44">Project</th>
                <th className="text-left px-3 py-2">Memo</th>
                <th className="text-right px-3 py-2 w-28">Debit</th>
                <th className="text-right px-3 py-2 w-28">Credit</th>
                <th className="px-2 py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={l.key} className="border-t border-hm-text/10">
                  <td className="px-3 py-2">
                    <Select
                      value={l.account_id}
                      onChange={(e) =>
                        update(idx, { account_id: e.target.value })
                      }
                      required
                    >
                      <option value="">— select —</option>
                      {sortedAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} · {a.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={l.project_id}
                      onChange={(e) =>
                        update(idx, { project_id: e.target.value })
                      }
                    >
                      <option value="">—</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={l.memo}
                      onChange={(e) => update(idx, { memo: e.target.value })}
                      placeholder="Optional"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={l.debit}
                      onFocus={() => update(idx, { credit: '' })}
                      onChange={(e) =>
                        update(idx, { debit: e.target.value, credit: '' })
                      }
                      className="text-right"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={l.credit}
                      onFocus={() => update(idx, { debit: '' })}
                      onChange={(e) =>
                        update(idx, { credit: e.target.value, debit: '' })
                      }
                      className="text-right"
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      disabled={lines.length <= 2}
                      className="font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav hover:text-hm-text disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label="Remove line"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-hm-text/15 bg-hm-text/[0.02]">
                <td colSpan={3} className="px-3 py-2">
                  <button
                    type="button"
                    onClick={addLine}
                    className="font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav hover:text-hm-text"
                  >
                    + Add line
                  </button>
                </td>
                <td className="text-right px-3 py-2 font-serif">
                  {formatCents(totalDebits)}
                </td>
                <td className="text-right px-3 py-2 font-serif">
                  {formatCents(totalCredits)}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div
            className={[
              'font-sans text-[10px] uppercase tracking-[0.22em]',
              balanced
                ? 'text-hm-text'
                : totalCents === 0
                  ? 'text-hm-nav'
                  : 'text-red-700',
            ].join(' ')}
          >
            {balanced
              ? 'Balanced'
              : totalCents === 0
                ? 'Enter debits and credits'
                : `Out of balance by ${formatCents(Math.abs(totalCents))}`}
          </div>
          {err ? (
            <div className="font-garamond text-[0.95rem] text-red-700">
              {err}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={!balanced}>
            Save entry
          </Button>
        </div>
      </form>
    </Modal>
  )
}
