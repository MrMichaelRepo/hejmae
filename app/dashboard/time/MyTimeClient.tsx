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
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { StatGrid, StatTile } from '@/components/finances/SummaryTile'
import { toast } from '@/components/ui/Toast'
import {
  WEEK_DAY_LABELS,
  addDays,
  fmtMinutes,
  isoDate,
  startOfWeekMonday,
  weekDates,
} from '@/lib/time/week'
import type { ProjectRow, TimeEntryRow } from '@/lib/supabase/types'

interface Props {
  initialEntries: TimeEntryRow[]
  initialRunning: TimeEntryRow | null
  projects: ProjectRow[]
  defaultHourlyRateCents: number
  weeklyCapacityMinutes: number
}

export default function MyTimeClient({
  initialEntries,
  initialRunning,
  projects,
  defaultHourlyRateCents,
  weeklyCapacityMinutes,
}: Props) {
  const [entries, setEntries] = useState<TimeEntryRow[]>(initialEntries)
  const [running, setRunning] = useState<TimeEntryRow | null>(initialRunning)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [weekStart, setWeekStart] = useState<Date>(startOfWeekMonday(new Date()))
  const [editing, setEditing] = useState<TimeEntryRow | null>(null)
  const [adding, setAdding] = useState(false)

  const projIx = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  async function refresh() {
    const today = new Date()
    const fromIso = isoDate(addDays(today, -90))
    const [eRes, tRes] = await Promise.all([
      api.get<TimeEntryRow[]>(`/api/time-entries?from=${fromIso}`),
      api.get<TimeEntryRow | null>('/api/time-entries/timer'),
    ])
    setEntries((eRes.data as TimeEntryRow[]) ?? [])
    setRunning((tRes.data as TimeEntryRow | null) ?? null)
  }

  // Tick a "now" so the running timer ticks each second.
  const [, force] = useState(0)
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [running])

  const wDates = weekDates(weekStart)
  const wFrom = isoDate(wDates[0])
  const wTo = isoDate(wDates[6])

  // Group week entries by project_id × day-of-week index.
  const grid = useMemo(() => {
    const m = new Map<string, Map<number, number>>() // proj -> dayIdx -> minutes
    for (const e of entries) {
      const startDay = e.started_at.slice(0, 10)
      if (startDay < wFrom || startDay > wTo) continue
      const idx = wDates.findIndex((d) => isoDate(d) === startDay)
      if (idx < 0) continue
      const mins = e.duration_minutes ?? 0
      const inner = m.get(e.project_id) ?? new Map<number, number>()
      inner.set(idx, (inner.get(idx) ?? 0) + mins)
      m.set(e.project_id, inner)
    }
    return m
  }, [entries, wDates, wFrom, wTo])

  const weekTotalMins = useMemo(() => {
    let n = 0
    for (const inner of grid.values()) for (const v of inner.values()) n += v
    return n
  }, [grid])

  const billableTotalMins = useMemo(() => {
    let n = 0
    for (const e of entries) {
      const startDay = e.started_at.slice(0, 10)
      if (startDay < wFrom || startDay > wTo) continue
      if (!e.billable) continue
      n += e.duration_minutes ?? 0
    }
    return n
  }, [entries, wFrom, wTo])

  const utilizationPct =
    weeklyCapacityMinutes > 0
      ? Math.round((weekTotalMins / weeklyCapacityMinutes) * 100)
      : null

  // Unbilled billable amount (used for Push to invoice flows).
  const unbilledCents = entries
    .filter((e) => e.billable && !e.invoice_line_item_id && e.duration_minutes != null)
    .reduce(
      (a, e) => a + Math.round((e.duration_minutes! / 60) * e.hourly_rate_cents),
      0,
    )

  return (
    <div>
      <PageHeader
        eyebrow="Time"
        title="My time"
        subtitle="Log time once and roll it into invoices later. Your default rate is used unless you override at log time."
        actions={
          <Button onClick={() => setAdding(true)}>Manual entry</Button>
        }
      />

      <RunningTimer
        running={running}
        projects={projects}
        onStarted={async (e) => {
          setRunning(e)
          await refresh()
        }}
        onStopped={async () => {
          setRunning(null)
          await refresh()
          toast.success('Timer stopped')
        }}
      />

      <StatGrid cols={4}>
        <StatTile
          label="Week total"
          value={fmtMinutes(weekTotalMins)}
          sub={`Capacity ${fmtMinutes(weeklyCapacityMinutes)}`}
        />
        <StatTile
          label="Billable this week"
          value={fmtMinutes(billableTotalMins)}
          sub={`${weekTotalMins > 0 ? Math.round((billableTotalMins / weekTotalMins) * 100) : 0}% billable`}
        />
        <StatTile
          label="Utilization"
          value={utilizationPct != null ? `${utilizationPct}%` : '—'}
          sub="Logged ÷ capacity"
        />
        <StatTile
          label="Unbilled (90d)"
          value={formatCents(unbilledCents)}
          sub="Push to invoice on a project"
        />
      </StatGrid>

      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={() => setWeekStart((w) => addDays(w, -7))}
          className="font-sans text-[10px] uppercase tracking-[0.2em] text-ink-muted hover:text-ink"
        >
          ← Previous week
        </button>
        <span className="font-serif text-[1.1rem]">
          Week of {formatDate(wFrom)}
        </span>
        <button
          type="button"
          onClick={() => setWeekStart((w) => addDays(w, 7))}
          className="font-sans text-[10px] uppercase tracking-[0.2em] text-ink-muted hover:text-ink"
        >
          Next week →
        </button>
        <button
          type="button"
          onClick={() => setWeekStart(startOfWeekMonday(new Date()))}
          className="font-sans text-[10px] uppercase tracking-[0.2em] text-ink-muted hover:text-ink ml-2"
        >
          This week
        </button>
        <div className="ml-auto inline-flex border border-line rounded-sm overflow-hidden">
          {(['grid', 'list'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={[
                'px-3 py-1.5 font-sans text-[10px] uppercase tracking-[0.2em] transition-colors',
                view === v
                  ? 'bg-ink text-bg'
                  : 'text-ink-muted hover:text-ink',
              ].join(' ')}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === 'grid' ? (
        <WeeklyGrid
          grid={grid}
          weekDates={wDates}
          projects={projects}
          weekTotalMins={weekTotalMins}
        />
      ) : (
        <EntryList
          entries={entries
            .filter((e) => {
              const d = e.started_at.slice(0, 10)
              return d >= wFrom && d <= wTo
            })
            .sort((a, b) => b.started_at.localeCompare(a.started_at))}
          projIx={projIx}
          onEdit={setEditing}
        />
      )}

      <Modal
        open={adding || editing !== null}
        onClose={() => {
          setAdding(false)
          setEditing(null)
        }}
        title={editing ? 'Edit time entry' : 'Manual time entry'}
        size="lg"
      >
        <ManualEntryForm
          projects={projects}
          defaultRateCents={defaultHourlyRateCents}
          existing={editing}
          onSaved={async () => {
            setAdding(false)
            setEditing(null)
            await refresh()
            toast.success('Saved')
          }}
          onDeleted={async () => {
            setEditing(null)
            await refresh()
            toast.success('Deleted')
          }}
          onCancel={() => {
            setAdding(false)
            setEditing(null)
          }}
        />
      </Modal>
    </div>
  )
}

function RunningTimer({
  running,
  projects,
  onStarted,
  onStopped,
}: {
  running: TimeEntryRow | null
  projects: ProjectRow[]
  onStarted: (e: TimeEntryRow) => void
  onStopped: () => void
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [description, setDescription] = useState('')
  const [billable, setBillable] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  async function start() {
    if (!projectId || !description.trim()) {
      toast.error('Pick a project and write a brief description')
      return
    }
    setSubmitting(true)
    try {
      const res = await api.post<TimeEntryRow>('/api/time-entries/timer', {
        project_id: projectId,
        description: description.trim(),
        billable,
      })
      onStarted(res.data as TimeEntryRow)
      setDescription('')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to start')
    } finally {
      setSubmitting(false)
    }
  }

  async function stop() {
    if (!running) return
    setSubmitting(true)
    try {
      await api.patch(`/api/time-entries/${running.id}`, { stop: true })
      onStopped()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to stop')
    } finally {
      setSubmitting(false)
    }
  }

  if (running) {
    const startMs = new Date(running.started_at).getTime()
    const elapsedSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000))
    const h = Math.floor(elapsedSec / 3600)
    const m = Math.floor((elapsedSec % 3600) / 60)
    const s = elapsedSec % 60
    const projName = projects.find((p) => p.id === running.project_id)?.name ?? '—'
    return (
      <div className="border border-success/40 bg-success-soft/40 p-5 mb-8 flex items-center gap-4">
        <div className="font-serif text-[1.6rem] tabular-nums leading-none">
          {h}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-garamond text-[1rem] truncate">
            {running.description}
          </div>
          <div className="font-sans text-[10px] uppercase tracking-[0.18em] text-success">
            {projName} · {running.billable ? 'Billable' : 'Internal'}
          </div>
        </div>
        <Button onClick={stop} loading={submitting}>
          Stop
        </Button>
      </div>
    )
  }

  return (
    <div className="border border-line bg-bg p-5 mb-8 grid grid-cols-1 md:grid-cols-[1fr_2fr_auto_auto] items-end gap-3">
      <div>
        <Label htmlFor="t-proj">Project</Label>
        <Select
          id="t-proj"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          {projects.length === 0 ? (
            <option value="">No projects yet</option>
          ) : null}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="t-desc">What are you working on?</Label>
        <Input
          id="t-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Site visit follow-up"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              start()
            }
          }}
        />
      </div>
      <Checkbox
        className="pb-2.5"
        checked={billable}
        onChange={(e) => setBillable(e.target.checked)}
        label="Billable"
      />
      <Button variant="primary" onClick={start} loading={submitting}>
        Start
      </Button>
    </div>
  )
}

function WeeklyGrid({
  grid,
  weekDates,
  projects,
  weekTotalMins,
}: {
  grid: Map<string, Map<number, number>>
  weekDates: Date[]
  projects: ProjectRow[]
  weekTotalMins: number
}) {
  const projectIds = Array.from(grid.keys())
  if (projectIds.length === 0) {
    return (
      <EmptyState
        title="No time logged this week"
        body="Use the timer above or click 'Manual entry' to add hours after the fact."
        small
      />
    )
  }

  // Per-day totals.
  const dayTotals = weekDates.map((_, i) => {
    let n = 0
    for (const inner of grid.values()) n += inner.get(i) ?? 0
    return n
  })

  return (
    <div className="border border-line overflow-x-auto">
      <table className="w-full font-garamond text-[0.95rem]">
        <thead>
          <tr className="bg-ink/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted">
            <th className="text-left px-4 py-3">Project</th>
            {weekDates.map((d, i) => (
              <th key={i} className="text-right px-3 py-3">
                {WEEK_DAY_LABELS[i]} {d.getUTCDate()}
              </th>
            ))}
            <th className="text-right px-4 py-3">Total</th>
          </tr>
        </thead>
        <tbody>
          {projectIds.map((pid) => {
            const inner = grid.get(pid)!
            const proj = projects.find((p) => p.id === pid)
            const total = Array.from(inner.values()).reduce((a, n) => a + n, 0)
            return (
              <tr key={pid} className="border-t border-line">
                <td className="px-4 py-3">
                  {proj ? (
                    <Link
                      href={`/dashboard/projects/${pid}`}
                      className="hover:text-ink"
                    >
                      {proj.name}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                {weekDates.map((_, i) => {
                  const v = inner.get(i) ?? 0
                  return (
                    <td
                      key={i}
                      className={[
                        'text-right px-3 py-3 tabular-nums',
                        v === 0 ? 'text-ink-subtle/70' : '',
                      ].join(' ')}
                    >
                      {v > 0 ? fmtMinutes(v) : '—'}
                    </td>
                  )
                })}
                <td className="text-right px-4 py-3 tabular-nums">
                  {fmtMinutes(total)}
                </td>
              </tr>
            )
          })}
          <tr className="border-t border-line-strong font-sans text-[10px] uppercase tracking-[0.18em]">
            <td className="px-4 py-3">Day totals</td>
            {dayTotals.map((d, i) => (
              <td key={i} className="text-right px-3 py-3 tabular-nums">
                {fmtMinutes(d)}
              </td>
            ))}
            <td className="text-right px-4 py-3 tabular-nums">
              {fmtMinutes(weekTotalMins)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function EntryList({
  entries,
  projIx,
  onEdit,
}: {
  entries: TimeEntryRow[]
  projIx: Map<string, ProjectRow>
  onEdit: (e: TimeEntryRow) => void
}) {
  if (entries.length === 0) {
    return <EmptyState title="No entries this week" small />
  }
  return (
    <div className="border border-line overflow-x-auto">
      <table className="w-full font-garamond text-[0.95rem]">
        <thead>
          <tr className="bg-ink/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted">
            <th className="text-left px-4 py-3">Date</th>
            <th className="text-left px-4 py-3">Project</th>
            <th className="text-left px-4 py-3">Description</th>
            <th className="text-right px-4 py-3">Hours</th>
            <th className="text-right px-4 py-3">Rate</th>
            <th className="text-right px-4 py-3">Amount</th>
            <th className="text-center px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const p = projIx.get(e.project_id)
            const minutes = e.duration_minutes ?? 0
            const amount = Math.round((minutes / 60) * e.hourly_rate_cents)
            const isBilled = Boolean(e.invoice_line_item_id)
            return (
              <tr
                key={e.id}
                onClick={() => (isBilled ? undefined : onEdit(e))}
                className={[
                  'border-t border-line',
                  isBilled
                    ? 'cursor-default'
                    : 'hover:bg-ink/[0.03] cursor-pointer',
                ].join(' ')}
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatDate(e.started_at)}
                </td>
                <td className="px-4 py-3">{p?.name ?? '—'}</td>
                <td className="px-4 py-3">
                  {e.description}
                  {!e.billable ? (
                    <span className="ml-2 font-sans text-[9px] uppercase tracking-[0.2em] text-ink-muted">
                      internal
                    </span>
                  ) : null}
                </td>
                <td className="text-right px-4 py-3 tabular-nums">
                  {fmtMinutes(minutes)}
                </td>
                <td className="text-right px-4 py-3 text-ink-muted">
                  {formatCents(e.hourly_rate_cents)}/hr
                </td>
                <td className="text-right px-4 py-3 tabular-nums">
                  {formatCents(amount)}
                </td>
                <td className="text-center px-4 py-3">
                  {isBilled ? (
                    <span className="font-sans text-[9px] uppercase tracking-[0.2em] text-success">
                      Invoiced
                    </span>
                  ) : e.ended_at ? (
                    <span className="font-sans text-[9px] uppercase tracking-[0.2em] text-ink-muted">
                      Logged
                    </span>
                  ) : (
                    <span className="font-sans text-[9px] uppercase tracking-[0.2em] text-success">
                      Running
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ManualEntryForm({
  projects,
  defaultRateCents,
  existing,
  onSaved,
  onDeleted,
  onCancel,
}: {
  projects: ProjectRow[]
  defaultRateCents: number
  existing: TimeEntryRow | null
  onSaved: () => void
  onDeleted: () => void
  onCancel: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(
    existing ? existing.started_at.slice(0, 10) : today,
  )
  const [hours, setHours] = useState(
    existing
      ? ((existing.duration_minutes ?? 0) / 60).toFixed(2)
      : '',
  )
  const [projectId, setProjectId] = useState(
    existing?.project_id ?? projects[0]?.id ?? '',
  )
  const [description, setDescription] = useState(existing?.description ?? '')
  const [billable, setBillable] = useState(existing?.billable ?? true)
  const [rate, setRate] = useState(
    String(existing?.hourly_rate_cents ?? defaultRateCents) || '0',
  )
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const confirm = useConfirm()

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    const h = Number(hours)
    if (!Number.isFinite(h) || h <= 0) {
      setErr('Enter hours greater than zero.')
      return
    }
    if (!projectId) {
      setErr('Pick a project.')
      return
    }
    if (!description.trim()) {
      setErr('Add a brief description.')
      return
    }
    const minutes = Math.round(h * 60)
    const startedAt = new Date(`${date}T09:00:00.000Z`).toISOString()
    const endedAt = new Date(
      new Date(startedAt).getTime() + minutes * 60_000,
    ).toISOString()

    setSubmitting(true)
    try {
      const body = {
        project_id: projectId,
        description: description.trim(),
        started_at: startedAt,
        ended_at: endedAt,
        duration_minutes: minutes,
        hourly_rate_cents: Math.max(0, Math.round(Number(rate) || 0)),
        billable,
        notes: notes || null,
      }
      if (existing) {
        await api.patch(`/api/time-entries/${existing.id}`, body)
      } else {
        await api.post('/api/time-entries', body)
      }
      onSaved()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  async function remove() {
    if (!existing) return
    const ok = await confirm({
      title: 'Delete this entry?',
      body: 'This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    setSubmitting(true)
    try {
      await api.del(`/api/time-entries/${existing.id}`)
      onDeleted()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Delete failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="te-date">Date</Label>
          <Input
            id="te-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="te-hours">Hours</Label>
          <Input
            id="te-hours"
            type="number"
            inputMode="decimal"
            step="0.25"
            min="0"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="te-rate">Rate (cents/hr)</Label>
          <Input
            id="te-rate"
            type="number"
            min="0"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="te-proj">Project</Label>
        <Select
          id="te-proj"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          required
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="te-desc">Description</Label>
        <Input
          id="te-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
      </div>
      <Checkbox
        checked={billable}
        onChange={(e) => setBillable(e.target.checked)}
        label="Billable"
      />
      <div>
        <Label htmlFor="te-notes">Notes</Label>
        <Textarea
          id="te-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      {err ? (
        <div className="font-garamond text-[0.95rem] text-danger">{err}</div>
      ) : null}
      <div className="flex justify-between pt-2">
        {existing && !existing.invoice_line_item_id ? (
          <Button type="button" variant="danger" onClick={remove} disabled={submitting}>
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-3">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {existing ? 'Save' : 'Add entry'}
          </Button>
        </div>
      </div>
    </form>
  )
}
