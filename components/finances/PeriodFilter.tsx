'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
import type { PeriodKey } from '@/lib/finances/period'
import type { AccountingBasis } from '@/lib/supabase/types'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Input, Label, Select } from '@/components/ui/Input'

const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: 'mtd', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'qtd', label: 'This quarter' },
  { key: 'last_quarter', label: 'Last quarter' },
  { key: 'ytd', label: 'YTD' },
  { key: 'last_year', label: 'Last year' },
  { key: 'all_time', label: 'All time' },
  { key: 'custom', label: 'Custom…' },
]

export interface PeriodFilterBarProps {
  periodKey: PeriodKey
  basis: AccountingBasis
  studioBasis: AccountingBasis
  // The resolved range, for the human label.
  rangeLabel: string
  // Show / hide the basis toggle (e.g. trial balance is balance-sheet, basis irrelevant).
  showBasis?: boolean
  // Show / hide the period dropdown (e.g. trial balance is point-in-time as-of).
  showPeriod?: boolean
  // Optional extra controls rendered to the right.
  extra?: React.ReactNode
  // Default fiscal year start (so the bar can warn when it differs from the studio default).
  studioFiscalYearStartMonth: number
}

export function PeriodFilterBar(props: PeriodFilterBarProps) {
  const {
    periodKey,
    basis,
    studioBasis,
    rangeLabel,
    showBasis = true,
    showPeriod = true,
    extra,
  } = props
  const router = useRouter()
  const searchParams = useSearchParams()
  const [customOpen, setCustomOpen] = useState(false)

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k)
        else next.set(k, v)
      }
      router.replace(`?${next.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  const handlePeriodChange = (k: PeriodKey) => {
    if (k === 'custom') {
      setCustomOpen(true)
      return
    }
    // Clear from/to when switching to a named period.
    setParam({ period: k, from: null, to: null })
  }

  const initialFrom = searchParams.get('from') ?? ''
  const initialTo = searchParams.get('to') ?? new Date().toISOString().slice(0, 10)

  return (
    <div className="flex flex-wrap items-end gap-3 mb-8 pb-6 border-b border-line">
      {showPeriod ? (
        <div className="flex items-center gap-2">
          <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted">
            Period
          </span>
          <div className="w-44">
            <Select
              value={periodKey}
              onChange={(e) => handlePeriodChange(e.target.value as PeriodKey)}
            >
              {PERIODS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
          <span className="font-garamond text-[0.9rem] text-ink-muted">
            {rangeLabel}
          </span>
        </div>
      ) : null}

      {showBasis ? (
        <div className="flex items-center gap-2 ml-auto">
          <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted">
            Basis
          </span>
          <div className="inline-flex border border-line rounded-sm overflow-hidden">
            {(['cash', 'accrual'] as AccountingBasis[]).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setParam({ basis: b === studioBasis ? null : b })}
                className={[
                  'px-3 py-2 font-sans text-[10px] uppercase tracking-[0.2em] transition-colors',
                  basis === b
                    ? 'bg-ink text-bg'
                    : 'text-ink-muted hover:text-ink',
                ].join(' ')}
              >
                {b}
              </button>
            ))}
          </div>
          {basis !== studioBasis ? (
            <span
              className="font-sans text-[9px] uppercase tracking-[0.22em] text-ink-subtle"
              title={`Studio default: ${studioBasis}`}
            >
              Override
            </span>
          ) : null}
        </div>
      ) : null}

      {extra}

      <Modal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        title="Custom date range"
        size="sm"
      >
        <CustomRangeForm
          initialFrom={initialFrom}
          initialTo={initialTo}
          onApply={(from, to) => {
            setParam({ period: 'custom', from, to })
            setCustomOpen(false)
          }}
          onCancel={() => setCustomOpen(false)}
        />
      </Modal>
    </div>
  )
}

function CustomRangeForm({
  initialFrom,
  initialTo,
  onApply,
  onCancel,
}: {
  initialFrom: string
  initialTo: string
  onApply: (from: string, to: string) => void
  onCancel: () => void
}) {
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)
  const valid = useMemo(() => Boolean(from && to && from <= to), [from, to])
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onApply(from, to)
      }}
      className="space-y-5"
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="r-from">From</Label>
          <Input
            id="r-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="r-to">To</Label>
          <Input
            id="r-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!valid}>
          Apply
        </Button>
      </div>
    </form>
  )
}
