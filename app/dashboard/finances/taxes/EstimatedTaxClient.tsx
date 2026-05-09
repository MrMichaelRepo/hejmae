'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { formatCents, formatDate } from '@/lib/format'
import { PageHeader } from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { Input, Label, Textarea } from '@/components/ui/Input'
import { StatGrid, StatTile } from '@/components/finances/SummaryTile'
import { toast } from '@/components/ui/Toast'
import type {
  EstimatedTaxPaymentRow,
  EstimatedTaxJurisdiction,
} from '@/lib/supabase/types'
import type { EstimatedTaxProjection } from '@/lib/finances/estimated_tax'

interface Props {
  taxYear: number
  projection: EstimatedTaxProjection
  payments: EstimatedTaxPaymentRow[]
  dueDates: Record<number, string>
  canEdit: boolean
  yearOptions: number[]
  settingsHref: string
}

export default function EstimatedTaxClient({
  taxYear,
  projection,
  payments,
  dueDates,
  canEdit,
  yearOptions,
  settingsHref,
}: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState<{
    quarter: number
    jurisdiction: EstimatedTaxJurisdiction
  } | null>(null)

  // Index payments by (jurisdiction, quarter).
  const byKey = new Map<string, EstimatedTaxPaymentRow>()
  for (const p of payments) byKey.set(`${p.jurisdiction}:${p.quarter}`, p)

  return (
    <div>
      <PageHeader
        eyebrow="Tax planning"
        title="Quarterly estimated taxes"
        subtitle={`Projection for ${taxYear}, based on YTD net income and your studio rates.`}
        actions={
          <Link href={settingsHref}>
            <Button variant="ghost">Adjust rates</Button>
          </Link>
        }
      />

      <div className="flex items-center gap-3 mb-6 pb-6 border-b border-hm-text/10">
        <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav">
          Tax year
        </span>
        <div className="inline-flex border border-hm-text/15 rounded-sm overflow-hidden">
          {yearOptions.map((y) => (
            <Link
              key={y}
              href={`?year=${y}`}
              className={[
                'px-4 py-2 font-sans text-[10px] uppercase tracking-[0.2em] transition-colors',
                y === taxYear
                  ? 'bg-hm-text text-bg'
                  : 'text-hm-nav hover:text-hm-text',
              ].join(' ')}
            >
              {y}
            </Link>
          ))}
        </div>
      </div>

      <p className="font-garamond text-[0.95rem] text-hm-nav mb-4 leading-[1.6] max-w-3xl">
        These are projections only — not tax advice. Confirm with your CPA
        before sending anything to the IRS or state. Rates pulled from{' '}
        <Link href={settingsHref} className="underline hover:text-hm-text">
          finance settings
        </Link>
        .
      </p>

      <StatGrid cols={4}>
        <StatTile
          label="YTD net income"
          value={formatCents(projection.ytd_net_income_cents)}
          sub={`Day ${projection.days_elapsed} of ${projection.days_in_year}`}
        />
        <StatTile
          label="Projected annual"
          value={formatCents(projection.projected_annual_net_income_cents)}
          sub="If current pace holds"
        />
        <StatTile
          label="Projected total tax"
          value={formatCents(projection.projected_total_tax_cents)}
          sub="Federal + SE + state"
        />
        <StatTile
          label="Per-quarter estimate"
          value={formatCents(projection.per_quarter_estimate_cents)}
          sub={`Already paid: ${formatCents(projection.total_paid_cents)}`}
          emphasis
        />
      </StatGrid>

      <h2 className="font-serif text-[1.3rem] leading-tight mb-3">
        Tax breakdown
      </h2>
      <div className="border border-hm-text/10 mb-10">
        <table className="w-full font-garamond text-[0.95rem]">
          <tbody>
            <Row label="Federal income tax" value={projection.projected_federal_tax_cents} />
            <Row label="Self-employment tax" value={projection.projected_self_employment_tax_cents} />
            <Row label="State income tax" value={projection.projected_state_tax_cents} />
            <tr className="border-t border-hm-text/30 font-sans text-[10px] uppercase tracking-[0.18em]">
              <td className="px-4 py-3">Total projected</td>
              <td className="text-right px-4 py-3">
                {formatCents(projection.projected_total_tax_cents)}
              </td>
            </tr>
            <tr className="border-t border-hm-text/10">
              <td className="px-4 py-3 text-hm-nav">Already paid</td>
              <td className="text-right px-4 py-3 text-hm-nav">
                ({formatCents(projection.total_paid_cents)})
              </td>
            </tr>
            <tr className="border-t border-hm-text/30 font-sans text-[10px] uppercase tracking-[0.18em]">
              <td className="px-4 py-3">Remaining estimate</td>
              <td className="text-right px-4 py-3">
                {formatCents(projection.remaining_estimate_cents)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="font-serif text-[1.3rem] leading-tight mb-3">
        Quarterly schedule
      </h2>
      <div className="border border-hm-text/10 overflow-x-auto mb-12">
        <table className="w-full font-garamond text-[0.95rem]">
          <thead>
            <tr className="bg-hm-text/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav">
              <th className="text-left px-4 py-3">Quarter</th>
              <th className="text-left px-4 py-3">Due</th>
              <th className="text-left px-4 py-3">Federal</th>
              <th className="text-left px-4 py-3">State</th>
              <th className="text-right px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4].map((q) => {
              const fed = byKey.get(`federal:${q}`)
              const state = byKey.get(`state:${q}`)
              return (
                <tr key={q} className="border-t border-hm-text/10">
                  <td className="px-4 py-3">Q{q}</td>
                  <td className="px-4 py-3 text-hm-nav whitespace-nowrap">
                    {formatDate(dueDates[q])}
                  </td>
                  <td className="px-4 py-3">
                    <PaymentCell
                      payment={fed}
                      jurisdiction="federal"
                      quarter={q}
                      canEdit={canEdit}
                      onEdit={() => setEditing({ jurisdiction: 'federal', quarter: q })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <PaymentCell
                      payment={state}
                      jurisdiction="state"
                      quarter={q}
                      canEdit={canEdit}
                      onEdit={() => setEditing({ jurisdiction: 'state', quarter: q })}
                    />
                  </td>
                  <td className="text-right px-4 py-3" />
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={
          editing
            ? `${editing.jurisdiction === 'federal' ? 'Federal' : 'State'} · Q${editing.quarter} ${taxYear}`
            : ''
        }
        size="sm"
      >
        {editing ? (
          <PaymentForm
            taxYear={taxYear}
            jurisdiction={editing.jurisdiction}
            quarter={editing.quarter}
            existing={byKey.get(`${editing.jurisdiction}:${editing.quarter}`)}
            suggested={projection.per_quarter_estimate_cents / 2}
            onSaved={() => {
              setEditing(null)
              router.refresh()
              toast.success('Saved')
            }}
            onCancel={() => setEditing(null)}
          />
        ) : null}
      </Modal>
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <tr className="border-t border-hm-text/10">
      <td className="px-4 py-3">{label}</td>
      <td className="text-right px-4 py-3">{formatCents(value)}</td>
    </tr>
  )
}

function PaymentCell({
  payment,
  canEdit,
  onEdit,
}: {
  payment: EstimatedTaxPaymentRow | undefined
  jurisdiction: EstimatedTaxJurisdiction
  quarter: number
  canEdit: boolean
  onEdit: () => void
}) {
  if (payment && payment.paid_at) {
    return (
      <button
        type="button"
        onClick={canEdit ? onEdit : undefined}
        className={[
          'text-left',
          canEdit ? 'cursor-pointer hover:text-hm-text' : 'cursor-default',
        ].join(' ')}
      >
        <div>{formatCents(payment.amount_cents)}</div>
        <div className="font-sans text-[9px] uppercase tracking-[0.2em] text-emerald-700">
          Paid {formatDate(payment.paid_at)}
        </div>
      </button>
    )
  }
  if (canEdit) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav hover:text-hm-text"
      >
        Record payment
      </button>
    )
  }
  return <span className="text-hm-nav/40">—</span>
}

function PaymentForm({
  taxYear,
  jurisdiction,
  quarter,
  existing,
  suggested,
  onSaved,
  onCancel,
}: {
  taxYear: number
  jurisdiction: EstimatedTaxJurisdiction
  quarter: number
  existing?: EstimatedTaxPaymentRow
  suggested: number
  onSaved: () => void
  onCancel: () => void
}) {
  const [amount, setAmount] = useState(
    existing ? (existing.amount_cents / 100).toFixed(2) : (suggested / 100).toFixed(2),
  )
  const [paidAt, setPaidAt] = useState(
    existing?.paid_at ?? new Date().toISOString().slice(0, 10),
  )
  const [reference, setReference] = useState(existing?.reference ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setErr(null)
    const a = Number(amount)
    if (!Number.isFinite(a) || a < 0) {
      setErr('Enter a non-negative amount.')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/api/finances/estimated-tax-payments', {
        jurisdiction,
        tax_year: taxYear,
        quarter,
        amount_cents: Math.round(a * 100),
        paid_at: paidAt || null,
        reference: reference || null,
        notes: notes || null,
      })
      onSaved()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      className="space-y-5"
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="amt">Amount (USD)</Label>
          <Input
            id="amt"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="paid">Paid on</Label>
          <Input
            id="paid"
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="ref">Reference</Label>
        <Input
          id="ref"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="EFTPS confirmation, check #…"
        />
      </div>
      <div>
        <Label htmlFor="nt">Notes</Label>
        <Textarea
          id="nt"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      {err ? (
        <div className="font-garamond text-[0.95rem] text-red-700">{err}</div>
      ) : null}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          Save
        </Button>
      </div>
    </form>
  )
}

