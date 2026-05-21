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
import { Checkbox } from '@/components/ui/Checkbox'
import { StatGrid, StatTile } from '@/components/finances/SummaryTile'
import type {
  MileageLogRow,
  MileageRateRow,
  ProjectRow,
} from '@/lib/supabase/types'

interface Props {
  initialTrips: MileageLogRow[]
  initialRates: MileageRateRow[]
  initialProjects: ProjectRow[]
}

export default function MileageClient({
  initialTrips,
  initialRates,
  initialProjects,
}: Props) {
  const [trips, setTrips] = useState<MileageLogRow[]>(initialTrips)
  const [rates, setRates] = useState<MileageRateRow[]>(initialRates)
  const [projects, setProjects] = useState<ProjectRow[]>(initialProjects)
  const [creating, setCreating] = useState(false)
  const [editingRate, setEditingRate] = useState(false)
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)

  async function refresh() {
    const [tRes, rRes, pRes] = await Promise.all([
      api.get<MileageLogRow[]>('/api/finances/mileage'),
      api.get<MileageRateRow[]>('/api/finances/mileage-rates'),
      api.get<ProjectRow[]>('/api/projects'),
    ])
    setTrips((tRes.data as MileageLogRow[]) ?? [])
    setRates((rRes.data as MileageRateRow[]) ?? [])
    setProjects((pRes.data as ProjectRow[]) ?? [])
  }

  const projIx = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  )

  // Years that have data, plus the current year and last year (so the
  // selector always offers them even before the first trip is logged).
  const yearOptions = useMemo(() => {
    const set = new Set<number>([currentYear, currentYear - 1])
    for (const t of trips) set.add(new Date(t.trip_date).getFullYear())
    for (const r of rates) set.add(r.year)
    return Array.from(set).sort((a, b) => b - a)
  }, [trips, rates, currentYear])

  const tripsForYear = useMemo(
    () => trips.filter((t) => new Date(t.trip_date).getFullYear() === year),
    [trips, year],
  )
  const milesForYear = tripsForYear.reduce((a, t) => a + Number(t.miles), 0)
  const amountForYear = tripsForYear.reduce((a, t) => a + t.amount_cents, 0)
  const tripCountForYear = tripsForYear.length

  // Top projects by miles for the year.
  const byProject = useMemo(() => {
    const m = new Map<string | '__studio__', number>()
    for (const t of tripsForYear) {
      const key = t.project_id ?? '__studio__'
      m.set(key, (m.get(key) ?? 0) + Number(t.miles))
    }
    return Array.from(m.entries())
      .map(([k, miles]) => ({
        key: k,
        name:
          k === '__studio__'
            ? 'Studio overhead'
            : projIx.get(k as string)?.name ?? '—',
        miles,
      }))
      .sort((a, b) => b.miles - a.miles)
      .slice(0, 5)
  }, [tripsForYear, projIx])

  const currentRate =
    rates.find((r) => r.year === year) ?? rates[0]

  const exportHref = `/api/finances/reports/mileage.csv?year=${year}`

  return (
    <div>
      <PageHeader
        eyebrow="Bookkeeping"
        title="Mileage"
        subtitle="Log business trips at the IRS standard rate. Each trip posts to Vehicle Expense as a non-cash deduction."
        actions={
          <div className="flex gap-3">
            <a href={exportHref} download>
              <Button variant="ghost">Export CSV</Button>
            </a>
            <Button onClick={() => setCreating(true)}>Log trip</Button>
          </div>
        }
      />

      <div className="flex items-center gap-3 mb-6 pb-6 border-b border-line">
        <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted">
          Year
        </span>
        <div className="inline-flex border border-line rounded-sm overflow-hidden">
          {yearOptions.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              className={[
                'px-4 py-2 font-sans text-[10px] uppercase tracking-[0.2em] transition-colors',
                y === year
                  ? 'bg-ink text-bg'
                  : 'text-ink-muted hover:text-ink',
              ].join(' ')}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      <StatGrid cols={4}>
        <StatTile
          label={`${year} miles`}
          value={milesForYear.toFixed(1)}
          sub={`${tripCountForYear} trip${tripCountForYear === 1 ? '' : 's'}`}
        />
        <StatTile
          label={`${year} deduction`}
          value={formatCents(amountForYear)}
          sub="Posts to Vehicle Expense"
        />
        <button
          type="button"
          onClick={() => setEditingRate(true)}
          className="bg-bg p-6 text-left hover:bg-ink/[0.03] transition-colors"
        >
          <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-2">
            Rate ({currentRate?.year ?? year})
          </div>
          <div className="font-serif text-[1.6rem] leading-none">
            {currentRate ? `${currentRate.rate_cents_per_mile}¢/mi` : 'not set'}
          </div>
          <div className="mt-2 font-garamond text-[0.85rem] text-ink-subtle">
            Click to edit
          </div>
        </button>
        <StatTile
          label="Avg trip"
          value={
            tripCountForYear > 0
              ? `${(milesForYear / tripCountForYear).toFixed(1)} mi`
              : '—'
          }
        />
      </StatGrid>

      {byProject.length > 0 ? (
        <div className="mb-10">
          <h2 className="font-serif text-[1.2rem] leading-tight mb-3">
            Top projects by miles ({year})
          </h2>
          <div className="border border-line">
            <table className="w-full font-garamond text-[0.95rem]">
              <tbody>
                {byProject.map((r) => (
                  <tr key={r.key} className="border-t border-line first:border-t-0">
                    <td className="px-4 py-2">{r.name}</td>
                    <td className="text-right px-4 py-2">
                      {r.miles.toFixed(1)} mi
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tripsForYear.length === 0 ? (
        <EmptyState
          title={`No trips logged for ${year}`}
          body="Drive to a client meeting, vendor showroom, or jobsite and log the mileage here. We'll multiply by the IRS rate and post it to your books."
          action={<Button onClick={() => setCreating(true)}>Log trip</Button>}
        />
      ) : (
        <div className="border border-line overflow-x-auto">
          <table className="w-full font-garamond text-[0.95rem]">
            <thead>
              <tr className="bg-ink/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Purpose</th>
                <th className="text-left px-4 py-3">From → To</th>
                <th className="text-left px-4 py-3">Project</th>
                <th className="text-right px-4 py-3">Miles</th>
                <th className="text-right px-4 py-3">Rate</th>
                <th className="text-right px-4 py-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {tripsForYear.map((t) => (
                <tr
                  key={t.id}
                  className="border-t border-line hover:bg-ink/[0.03]"
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDate(t.trip_date)}
                  </td>
                  <td className="px-4 py-3">
                    {t.purpose || (
                      <span className="text-ink-muted italic">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {[t.from_location, t.to_location]
                      .filter(Boolean)
                      .join(' → ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {t.project_id ? (
                      <Link
                        href={`/dashboard/projects/${t.project_id}`}
                        className="text-ink-muted hover:text-ink"
                      >
                        {projIx.get(t.project_id)?.name ?? '—'}
                      </Link>
                    ) : (
                      <span className="text-ink-subtle/70">Studio</span>
                    )}
                  </td>
                  <td className="text-right px-4 py-3">{Number(t.miles).toFixed(1)}</td>
                  <td className="text-right px-4 py-3 text-ink-muted">
                    {t.rate_cents_per_mile}¢
                  </td>
                  <td className="text-right px-4 py-3">
                    {formatCents(t.amount_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RateHistory rates={rates} onEdit={() => setEditingRate(true)} />

      <MileageModal
        open={creating}
        onClose={() => setCreating(false)}
        projects={projects}
        onSaved={async () => {
          setCreating(false)
          await refresh()
        }}
      />
      <RateModal
        open={editingRate}
        onClose={() => setEditingRate(false)}
        rates={rates}
        defaultYear={year}
        onSaved={async () => {
          setEditingRate(false)
          await refresh()
        }}
      />
    </div>
  )
}

function RateHistory({
  rates,
  onEdit,
}: {
  rates: MileageRateRow[]
  onEdit: () => void
}) {
  if (rates.length <= 1) return null
  const sorted = [...rates].sort((a, b) => b.year - a.year)
  return (
    <div className="mt-12">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-serif text-[1.2rem] leading-tight">
          Rate history
        </h2>
        <button
          type="button"
          onClick={onEdit}
          className="font-sans text-[10px] uppercase tracking-[0.2em] text-ink-muted hover:text-ink"
        >
          Edit
        </button>
      </div>
      <div className="border border-line overflow-x-auto">
        <table className="w-full font-garamond text-[0.95rem]">
          <thead>
            <tr className="bg-ink/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted">
              <th className="text-left px-4 py-3">Year</th>
              <th className="text-right px-4 py-3">Rate (cents/mile)</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-4 py-3">{r.year}</td>
                <td className="text-right px-4 py-3">
                  {r.rate_cents_per_mile}¢
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MileageModal({
  open,
  onClose,
  projects,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  projects: ProjectRow[]
  onSaved: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [miles, setMiles] = useState('')
  const [roundTrip, setRoundTrip] = useState(false)
  const [purpose, setPurpose] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [projectId, setProjectId] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setDate(today)
      setMiles('')
      setRoundTrip(false)
      setPurpose('')
      setFrom('')
      setTo('')
      setProjectId('')
      setNotes('')
      setErr(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    const m = Number(miles)
    if (!Number.isFinite(m) || m <= 0) {
      setErr('Enter miles greater than zero.')
      return
    }
    const totalMiles = roundTrip ? m * 2 : m
    setSubmitting(true)
    try {
      await api.post('/api/finances/mileage', {
        trip_date: date,
        miles: Math.round(totalMiles * 100) / 100,
        purpose: purpose || null,
        from_location: from || null,
        to_location: to || null,
        project_id: projectId || null,
        notes: notes || null,
      })
      onSaved()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to log trip')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Log a trip" size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="m-date">Date</Label>
            <Input
              id="m-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="m-miles">Miles (one-way)</Label>
            <Input
              id="m-miles"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={miles}
              onChange={(e) => setMiles(e.target.value)}
              required
            />
            <Checkbox
              className="mt-2"
              checked={roundTrip}
              onChange={(e) => setRoundTrip(e.target.checked)}
              label="Round trip (×2)"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="m-purpose">Purpose</Label>
          <Input
            id="m-purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. Site visit — Henderson kitchen"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="m-from">From</Label>
            <Input
              id="m-from"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="Studio"
            />
          </div>
          <div>
            <Label htmlFor="m-to">To</Label>
            <Input
              id="m-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="Client address"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="m-proj">Project (optional)</Label>
          <Select
            id="m-proj"
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
          <Label htmlFor="m-notes">Notes</Label>
          <Textarea
            id="m-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {err ? (
          <div className="font-garamond text-[0.95rem] text-danger">{err}</div>
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
            Save trip
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function RateModal({
  open,
  onClose,
  rates,
  defaultYear,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  rates: MileageRateRow[]
  defaultYear: number
  onSaved: () => void
}) {
  const [year, setYear] = useState(defaultYear)
  const [rate, setRate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setYear(defaultYear)
      const r = rates.find((x) => x.year === defaultYear)
      setRate(r ? String(r.rate_cents_per_mile) : '')
      setErr(null)
    }
  }, [open, rates, defaultYear])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    const r = Number(rate)
    if (!Number.isFinite(r) || r < 0) {
      setErr('Enter a non-negative rate.')
      return
    }
    setSubmitting(true)
    try {
      await fetch('/api/finances/mileage-rates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, rate_cents_per_mile: Math.round(r) }),
      }).then(async (res) => {
        if (!res.ok) throw new Error((await res.text()) || 'Failed')
      })
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save rate')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Mileage rate" size="sm">
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="font-garamond text-[0.95rem] text-ink-muted leading-[1.6]">
          IRS standard mileage rates: 67¢ (2024), 70¢ (2025). Update if the
          IRS publishes a new rate or you&apos;re tracking actuals.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="r-year">Year</Label>
            <Input
              id="r-year"
              type="number"
              min="2000"
              max="2100"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10) || year)}
              required
            />
          </div>
          <div>
            <Label htmlFor="r-rate">Rate (cents)</Label>
            <Input
              id="r-rate"
              type="number"
              min="0"
              max="500"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              required
            />
          </div>
        </div>

        {err ? (
          <div className="font-garamond text-[0.95rem] text-danger">{err}</div>
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
            Save rate
          </Button>
        </div>
      </form>
    </Modal>
  )
}
