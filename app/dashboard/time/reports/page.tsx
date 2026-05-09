import { requireDesigner } from '@/lib/auth/designer'
import { hasPermission, requirePermission } from '@/lib/auth/permissions'
import { listTimeEntries } from '@/lib/finances/time_entries'
import { supabaseAdmin } from '@/lib/supabase/server'
import { fmtMinutes } from '@/lib/time/week'
import { formatCents } from '@/lib/format'
import { PageHeader } from '@/components/ui/EmptyState'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { StatGrid, StatTile } from '@/components/finances/SummaryTile'
import type { ProjectRow } from '@/lib/supabase/types'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function TimeReportsPage({ searchParams }: Props) {
  const ctx = await requireDesigner()
  requirePermission(ctx, 'time:log')

  const sp = await searchParams
  const yearParam = Array.isArray(sp.year) ? sp.year[0] : sp.year
  const taxYear = Number.isFinite(Number(yearParam))
    ? parseInt(yearParam!, 10)
    : new Date().getUTCFullYear()
  const fromIso = `${taxYear}-01-01`
  const toIso = `${taxYear}-12-31`

  const canSeeAll = hasPermission(ctx, 'time:view_all')
  const entries = await listTimeEntries(ctx.designerId, {
    from: fromIso,
    to: toIso,
    user_id: canSeeAll ? null : ctx.userId,
  })

  const projectsRes = await supabaseAdmin()
    .from('projects')
    .select('*')
    .eq('designer_id', ctx.designerId)
  const projects = (projectsRes.data ?? []) as ProjectRow[]
  const projIx = new Map(projects.map((p) => [p.id, p]))

  const totalMins = entries.reduce((a, e) => a + (e.duration_minutes ?? 0), 0)
  const billableMins = entries
    .filter((e) => e.billable)
    .reduce((a, e) => a + (e.duration_minutes ?? 0), 0)
  const revenue = entries
    .filter((e) => e.billable && e.duration_minutes != null)
    .reduce(
      (a, e) =>
        a + Math.round((e.duration_minutes! / 60) * e.hourly_rate_cents),
      0,
    )
  const unbilled = entries
    .filter(
      (e) =>
        e.billable && !e.invoice_line_item_id && e.duration_minutes != null,
    )
    .reduce(
      (a, e) =>
        a + Math.round((e.duration_minutes! / 60) * e.hourly_rate_cents),
      0,
    )

  // By project.
  const byProject = new Map<string, { mins: number; billable: number; revenue: number }>()
  for (const e of entries) {
    const cur = byProject.get(e.project_id) ?? { mins: 0, billable: 0, revenue: 0 }
    cur.mins += e.duration_minutes ?? 0
    if (e.billable) {
      cur.billable += e.duration_minutes ?? 0
      cur.revenue += Math.round(((e.duration_minutes ?? 0) / 60) * e.hourly_rate_cents)
    }
    byProject.set(e.project_id, cur)
  }
  const projectRows = Array.from(byProject.entries())
    .map(([pid, v]) => ({ project: projIx.get(pid), ...v }))
    .sort((a, b) => b.mins - a.mins)

  return (
    <div>
      <PageHeader
        eyebrow="Time"
        title={`Annual time · ${taxYear}`}
        subtitle={
          canSeeAll
            ? 'Across the whole studio.'
            : 'Your hours only.'
        }
        actions={
          <a href={`/api/time-entries/export.csv?year=${taxYear}`} download>
            <Button variant="secondary">Export CSV</Button>
          </a>
        }
      />

      <StatGrid cols={4}>
        <StatTile label="Total logged" value={fmtMinutes(totalMins)} />
        <StatTile label="Billable" value={fmtMinutes(billableMins)} />
        <StatTile label="Revenue (recognized + unbilled)" value={formatCents(revenue)} />
        <StatTile label="Unbilled value" value={formatCents(unbilled)} />
      </StatGrid>

      <h2 className="font-serif text-[1.2rem] leading-tight mb-3">By project</h2>
      {projectRows.length === 0 ? (
        <EmptyState
          title="No time logged this year"
          body={`Once entries land for ${taxYear} they'll roll up here.`}
          small
        />
      ) : (
        <div className="border border-hm-text/10 overflow-x-auto">
          <table className="w-full font-garamond text-[0.95rem]">
            <thead>
              <tr className="bg-hm-text/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav">
                <th className="text-left px-4 py-3">Project</th>
                <th className="text-right px-4 py-3">Hours</th>
                <th className="text-right px-4 py-3">Billable hrs</th>
                <th className="text-right px-4 py-3">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {projectRows.map((r, i) => (
                <tr key={r.project?.id ?? `r${i}`} className="border-t border-hm-text/10">
                  <td className="px-4 py-3">{r.project?.name ?? '—'}</td>
                  <td className="text-right px-4 py-3 tabular-nums">{fmtMinutes(r.mins)}</td>
                  <td className="text-right px-4 py-3 tabular-nums">{fmtMinutes(r.billable)}</td>
                  <td className="text-right px-4 py-3 tabular-nums">{formatCents(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
