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

  const ytdMiles = useMemo(() => {
    const yr = new Date().getFullYear()
    return trips
      .filter((t) => new Date(t.trip_date).getFullYear() === yr)
      .reduce((a, t) => a + Number(t.miles), 0)
  }, [trips])
  const ytdAmount = useMemo(() => {
    const yr = new Date().getFullYear()
    return trips
      .filter((t) => new Date(t.trip_date).getFullYear() === yr)
      .reduce((a, t) => a + t.amount_cents, 0)
  }, [trips])

  const currentRate =
    rates.find((r) => r.year === new Date().getFullYear()) ?? rates[0]

  return (
    <div>
      <PageHeader
        eyebrow="Bookkeeping"
        title="Mileage"
        subtitle="Log business trips at the IRS standard rate. Each trip posts to Vehicle Expense as a non-cash deduction."
        actions={
          <Button onClick={() => setCreating(true)}>Log trip</Button>
        }
      />

      <div
        className="grid grid-cols-3 gap-px mb-10"
        style={{ background: 'rgba(30,33,40,0.1)' }}
      >
        <Stat label={`${new Date().getFullYear()} miles`} value={ytdMiles.toFixed(1)} />
        <Stat label={`${new Date().getFullYear()} deduction`} value={formatCents(ytdAmount)} />
        <button
          type="button"
          onClick={() => setEditingRate(true)}
          className="bg-bg p-6 text-left hover:bg-hm-text/[0.02] transition-colors"
        >
          <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-2">
            Rate ({currentRate?.year ?? new Date().getFullYear()})
          </div>
          <div className="font-serif text-[1.6rem] leading-none">
            {currentRate
              ? `${currentRate.rate_cents_per_mile}¢/mi`
              : 'not set'}
          </div>
        </button>
      </div>

      {trips.length === 0 ? (
        <EmptyState
          title="No trips logged"
          body="Drive to a client meeting, vendor showroom, or jobsite and log the mileage here. We'll multiply by the IRS rate and post it to your books."
          action={<Button onClick={() => setCreating(true)}>Log trip</Button>}
        />
      ) : (
        <div className="border border-hm-text/10 overflow-x-auto">
          <table className="w-full font-garamond text-[0.95rem]">
            <thead>
              <tr className="bg-hm-text/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav">
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
              {trips.map((t) => (
                <tr
                  key={t.id}
                  className="border-t border-hm-text/10 hover:bg-hm-text/[0.02]"
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDate(t.trip_date)}
                  </td>
                  <td className="px-4 py-3">
                    {t.purpose || (
                      <span className="text-hm-nav italic">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-hm-nav">
                    {[t.from_location, t.to_location]
                      .filter(Boolean)
                      .join(' → ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {t.project_id ? (
                      <Link
                        href={`/dashboard/projects/${t.project_id}`}
                        className="text-hm-nav hover:text-hm-text"
                      >
                        {projIx.get(t.project_id)?.name ?? '—'}
                      </Link>
                    ) : (
                      <span className="text-hm-nav/40">Studio</span>
                    )}
                  </td>
                  <td className="text-right px-4 py-3">{Number(t.miles).toFixed(1)}</td>
                  <td className="text-right px-4 py-3 text-hm-nav">
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
        onSaved={async () => {
          setEditingRate(false)
          await refresh()
        }}
      />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg p-6">
      <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-2">
        {label}
      </div>
      <div className="font-serif text-[1.6rem] leading-none">{value}</div>
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
    setSubmitting(true)
    try {
      await api.post('/api/finances/mileage', {
        trip_date: date,
        miles: Math.round(m * 100) / 100,
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
            <Label htmlFor="m-miles">Miles</Label>
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
          <div className="font-garamond text-[0.95rem] text-red-700">{err}</div>
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
  onSaved,
}: {
  open: boolean
  onClose: () => void
  rates: MileageRateRow[]
  onSaved: () => void
}) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [rate, setRate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      const yr = new Date().getFullYear()
      setYear(yr)
      const r = rates.find((x) => x.year === yr)
      setRate(r ? String(r.rate_cents_per_mile) : '')
      setErr(null)
    }
  }, [open, rates])

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
        <p className="font-garamond text-[0.95rem] text-hm-nav leading-[1.6]">
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
          <div className="font-garamond text-[0.95rem] text-red-700">{err}</div>
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
