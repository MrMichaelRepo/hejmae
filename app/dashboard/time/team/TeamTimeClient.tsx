'use client'

import { useMemo, useState } from 'react'
import { formatCents } from '@/lib/format'
import { PageHeader } from '@/components/ui/EmptyState'
import EmptyState from '@/components/ui/EmptyState'
import { StatGrid, StatTile } from '@/components/finances/SummaryTile'
import {
  WEEK_DAY_LABELS,
  addDays,
  fmtMinutes,
  isoDate,
  startOfWeekMonday,
  weekDates,
} from '@/lib/time/week'
import type { ProjectRow, TimeEntryRow } from '@/lib/supabase/types'

interface Member {
  user_id: string
  role: string
  name: string | null
  email: string
  weekly_capacity_minutes: number
  default_hourly_rate_cents: number
}

interface Props {
  initialEntries: TimeEntryRow[]
  projects: ProjectRow[]
  members: Member[]
}

export default function TeamTimeClient({
  initialEntries,
  projects,
  members,
}: Props) {
  const [entries] = useState<TimeEntryRow[]>(initialEntries)
  const [weekStart, setWeekStart] = useState<Date>(startOfWeekMonday(new Date()))
  const [memberFilter, setMemberFilter] = useState<string>('')
  const [projectFilter, setProjectFilter] = useState<string>('')

  const wDates = weekDates(weekStart)
  const wFrom = isoDate(wDates[0])
  const wTo = isoDate(wDates[6])

  const memberIx = useMemo(
    () => new Map(members.map((m) => [m.user_id, m])),
    [members],
  )
  const projIx = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  )

  const weekEntries = useMemo(
    () =>
      entries.filter((e) => {
        const d = e.started_at.slice(0, 10)
        if (d < wFrom || d > wTo) return false
        if (memberFilter && e.user_id !== memberFilter) return false
        if (projectFilter && e.project_id !== projectFilter) return false
        return true
      }),
    [entries, wFrom, wTo, memberFilter, projectFilter],
  )

  // Member × day grid (minutes).
  const grid = useMemo(() => {
    const m = new Map<string, Map<number, number>>()
    for (const e of weekEntries) {
      const uid = e.user_id ?? ''
      if (!uid) continue
      const startDay = e.started_at.slice(0, 10)
      const idx = wDates.findIndex((d) => isoDate(d) === startDay)
      if (idx < 0) continue
      const inner = m.get(uid) ?? new Map<number, number>()
      inner.set(idx, (inner.get(idx) ?? 0) + (e.duration_minutes ?? 0))
      m.set(uid, inner)
    }
    return m
  }, [weekEntries, wDates])

  // Member × project breakdown for the week.
  const memberProject = useMemo(() => {
    const m = new Map<string, Map<string, number>>()
    for (const e of weekEntries) {
      const uid = e.user_id ?? ''
      if (!uid) continue
      const inner = m.get(uid) ?? new Map<string, number>()
      inner.set(
        e.project_id,
        (inner.get(e.project_id) ?? 0) + (e.duration_minutes ?? 0),
      )
      m.set(uid, inner)
    }
    return m
  }, [weekEntries])

  // Top-level totals.
  const totalMins = weekEntries.reduce(
    (a, e) => a + (e.duration_minutes ?? 0),
    0,
  )
  const billableMins = weekEntries
    .filter((e) => e.billable)
    .reduce((a, e) => a + (e.duration_minutes ?? 0), 0)
  const billableRevenue = weekEntries
    .filter((e) => e.billable && e.duration_minutes != null)
    .reduce(
      (a, e) =>
        a + Math.round((e.duration_minutes! / 60) * e.hourly_rate_cents),
      0,
    )
  const totalCapacity = members.reduce(
    (a, m) => a + m.weekly_capacity_minutes,
    0,
  )

  // Per-member metrics for the week.
  const perMember = useMemo(() => {
    return members.map((m) => {
      const memberEntries = weekEntries.filter((e) => e.user_id === m.user_id)
      const logged = memberEntries.reduce(
        (a, e) => a + (e.duration_minutes ?? 0),
        0,
      )
      const billable = memberEntries
        .filter((e) => e.billable)
        .reduce((a, e) => a + (e.duration_minutes ?? 0), 0)
      const revenue = memberEntries
        .filter((e) => e.billable && e.duration_minutes != null)
        .reduce(
          (a, e) =>
            a + Math.round((e.duration_minutes! / 60) * e.hourly_rate_cents),
          0,
        )
      const utilizationPct =
        m.weekly_capacity_minutes > 0
          ? Math.round((logged / m.weekly_capacity_minutes) * 100)
          : null
      return { member: m, logged, billable, revenue, utilizationPct }
    })
  }, [members, weekEntries])

  // Unbilled across all members and time (not just this week).
  const unbilledTotal = entries
    .filter(
      (e) =>
        e.billable &&
        !e.invoice_line_item_id &&
        e.duration_minutes != null,
    )
    .reduce(
      (a, e) =>
        a + Math.round((e.duration_minutes! / 60) * e.hourly_rate_cents),
      0,
    )

  return (
    <div>
      <PageHeader
        eyebrow="Time"
        title="Team time"
        subtitle="See where your studio's hours are going. Filter by member or project; weeks navigate forward and back."
      />

      <StatGrid cols={4}>
        <StatTile
          label="Logged this week"
          value={fmtMinutes(totalMins)}
          sub={`Capacity ${fmtMinutes(totalCapacity)}`}
        />
        <StatTile
          label="Billable"
          value={fmtMinutes(billableMins)}
          sub={
            totalMins > 0
              ? `${Math.round((billableMins / totalMins) * 100)}% of logged`
              : '—'
          }
        />
        <StatTile
          label="Revenue (week)"
          value={formatCents(billableRevenue)}
          sub="At each member's snapshot rate"
        />
        <StatTile
          label="Unbilled (all time)"
          value={formatCents(unbilledTotal)}
          sub="Across all members"
        />
      </StatGrid>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          type="button"
          onClick={() => setWeekStart((w) => addDays(w, -7))}
          className="font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav hover:text-hm-text"
        >
          ← Previous
        </button>
        <span className="font-serif text-[1.1rem]">Week of {wFrom}</span>
        <button
          type="button"
          onClick={() => setWeekStart((w) => addDays(w, 7))}
          className="font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav hover:text-hm-text"
        >
          Next →
        </button>
        <button
          type="button"
          onClick={() => setWeekStart(startOfWeekMonday(new Date()))}
          className="font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav hover:text-hm-text ml-2"
        >
          This week
        </button>

        <div className="ml-auto flex items-center gap-3">
          <select
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
            className="bg-transparent border border-hm-text/15 rounded-sm px-3 py-2 font-garamond text-[0.9rem]"
          >
            <option value="">All members</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.name ?? m.email}
              </option>
            ))}
          </select>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="bg-transparent border border-hm-text/15 rounded-sm px-3 py-2 font-garamond text-[0.9rem]"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <h2 className="font-serif text-[1.2rem] leading-tight mb-3">
        Member × day
      </h2>
      {grid.size === 0 ? (
        <EmptyState
          title="No time logged this week"
          body="Once team members log hours, you'll see a per-day grid here."
          small
        />
      ) : (
        <div className="border border-hm-text/10 overflow-x-auto mb-10">
          <table className="w-full font-garamond text-[0.95rem]">
            <thead>
              <tr className="bg-hm-text/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav">
                <th className="text-left px-4 py-3">Member</th>
                {wDates.map((d, i) => (
                  <th key={i} className="text-right px-3 py-3">
                    {WEEK_DAY_LABELS[i]} {d.getUTCDate()}
                  </th>
                ))}
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-right px-4 py-3">Capacity</th>
                <th className="text-right px-4 py-3">Util.</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(grid.keys()).map((uid) => {
                const member = memberIx.get(uid)
                const inner = grid.get(uid)!
                const total = Array.from(inner.values()).reduce(
                  (a, n) => a + n,
                  0,
                )
                const cap = member?.weekly_capacity_minutes ?? 0
                const util = cap > 0 ? Math.round((total / cap) * 100) : null
                return (
                  <tr key={uid} className="border-t border-hm-text/10">
                    <td className="px-4 py-3">
                      {member?.name ?? member?.email ?? '—'}
                      {member?.role === 'owner' ? (
                        <span className="ml-2 font-sans text-[9px] uppercase tracking-[0.2em] text-hm-nav">
                          owner
                        </span>
                      ) : null}
                    </td>
                    {wDates.map((_, i) => {
                      const v = inner.get(i) ?? 0
                      return (
                        <td
                          key={i}
                          className={[
                            'text-right px-3 py-3 tabular-nums',
                            v === 0 ? 'text-hm-nav/40' : '',
                          ].join(' ')}
                        >
                          {v > 0 ? fmtMinutes(v) : '—'}
                        </td>
                      )
                    })}
                    <td className="text-right px-4 py-3 tabular-nums">
                      {fmtMinutes(total)}
                    </td>
                    <td className="text-right px-4 py-3 tabular-nums text-hm-nav">
                      {fmtMinutes(cap)}
                    </td>
                    <td
                      className={[
                        'text-right px-4 py-3 tabular-nums',
                        util != null && util > 100 ? 'text-amber-800' : '',
                      ].join(' ')}
                    >
                      {util != null ? `${util}%` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="font-serif text-[1.2rem] leading-tight mb-3">
        Per-member breakdown
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px mb-12" style={{ background: 'rgba(30,33,40,0.1)' }}>
        {perMember.map((row) => {
          const breakdown = memberProject.get(row.member.user_id)
          const projectRows = breakdown
            ? Array.from(breakdown.entries())
                .map(([pid, mins]) => ({
                  project: projIx.get(pid),
                  mins,
                }))
                .sort((a, b) => b.mins - a.mins)
            : []
          return (
            <div key={row.member.user_id} className="bg-bg p-5">
              <div className="flex items-baseline justify-between mb-3">
                <div className="font-serif text-[1.1rem]">
                  {row.member.name ?? row.member.email}
                </div>
                <div
                  className={[
                    'font-sans text-[10px] uppercase tracking-[0.2em]',
                    row.utilizationPct != null && row.utilizationPct > 100
                      ? 'text-amber-800'
                      : 'text-hm-nav',
                  ].join(' ')}
                >
                  {row.utilizationPct != null
                    ? `${row.utilizationPct}% utilized`
                    : '—'}
                </div>
              </div>
              <div className="flex gap-6 mb-3 font-garamond text-[0.95rem] text-hm-nav">
                <div>Logged: <span className="text-hm-text">{fmtMinutes(row.logged)}</span></div>
                <div>Billable: <span className="text-hm-text">{fmtMinutes(row.billable)}</span></div>
                <div>Revenue: <span className="text-hm-text">{formatCents(row.revenue)}</span></div>
              </div>
              {projectRows.length === 0 ? (
                <div className="font-garamond text-[0.9rem] text-hm-nav italic">
                  No time logged this week.
                </div>
              ) : (
                <table className="w-full font-garamond text-[0.9rem]">
                  <tbody>
                    {projectRows.map((r) => (
                      <tr key={r.project?.id ?? 'unk'} className="border-t border-hm-text/10 first:border-t-0">
                        <td className="py-1.5">{r.project?.name ?? '—'}</td>
                        <td className="text-right py-1.5 tabular-nums">
                          {fmtMinutes(r.mins)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
