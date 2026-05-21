import Link from 'next/link'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { getStudioFinanceSettings } from '@/lib/finances/studio_settings'
import { resolveBasis, resolvePeriod } from '@/lib/finances/period'
import { getStudioSummary, getProjectPL } from '@/lib/finances/rollup'
import { formatCents, formatPercent } from '@/lib/format'
import { PageHeader } from '@/components/ui/EmptyState'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { PeriodFilterBar } from '@/components/finances/PeriodFilter'
import { StatGrid, StatTile } from '@/components/finances/SummaryTile'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function FinancesPage({ searchParams }: Props) {
  const ctx = await requireDesigner()
  requirePermission(ctx, 'finances:view')
  const settings = await getStudioFinanceSettings(ctx.studioId)

  const sp = await searchParams
  const period = resolvePeriod({
    searchParams: sp,
    fiscal_year_start_month: settings.fiscal_year_start_month,
  })
  const basis = resolveBasis(sp, settings.accounting_basis)

  const [summary, projects] = await Promise.all([
    getStudioSummary(ctx.designerId, {
      from: period.from,
      to: period.to,
      basis,
    }),
    getProjectPL(ctx.designerId, {
      from: period.from,
      to: period.to,
      basis,
    }),
  ])

  const a = summary.aging
  const exportHref = `/api/finances/export?from=${period.from ?? ''}&to=${period.to}&basis=${basis}`

  return (
    <div>
      <PageHeader
        eyebrow="Bookkeeping"
        title="Overview"
        subtitle={`Studio rollup on ${basis} basis. ${period.label}.`}
        actions={
          <a href={exportHref} download>
            <Button variant="secondary">Export CSV</Button>
          </a>
        }
      />

      <PeriodFilterBar
        periodKey={period.key}
        basis={basis}
        studioBasis={settings.accounting_basis}
        rangeLabel={period.label}
        studioFiscalYearStartMonth={settings.fiscal_year_start_month}
      />

      <StatGrid cols={4}>
        <StatTile
          label={basis === 'cash' ? 'Revenue (received)' : 'Revenue (invoiced)'}
          value={formatCents(summary.revenue_cents)}
        />
        <StatTile label="COGS" value={formatCents(summary.total_cogs_cents)} />
        <StatTile
          label="Total expenses"
          value={formatCents(summary.total_expenses_cents)}
        />
        <StatTile
          label="Net income"
          value={formatCents(summary.net_income_cents)}
          emphasis
        />
      </StatGrid>

      <StatGrid cols={2}>
        <StatTile
          label="Gross profit"
          value={formatCents(summary.gross_profit_cents)}
          sub={`Margin ${formatPercent(summary.gross_margin_pct)}`}
        />
        <StatTile
          label="Outstanding receivables"
          value={formatCents(summary.aging.total_cents)}
          sub={`As of ${period.to}`}
        />
      </StatGrid>

      <h2 className="font-serif text-[1.3rem] leading-tight mb-4">
        Aging
      </h2>
      <div className="border border-line mb-12">
        <table className="w-full font-garamond text-[0.95rem]">
          <thead>
            <tr className="bg-ink/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted">
              <th className="text-left px-4 py-3">Bucket</th>
              <th className="text-right px-4 py-3">Outstanding</th>
              <th className="text-right px-4 py-3">% of total</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Current (0–30 days)', a.current_cents],
              ['31–60 days', a.bucket_31_60_cents],
              ['61–90 days', a.bucket_61_90_cents],
              ['Over 90 days', a.bucket_over_90_cents],
            ].map(([label, val]) => {
              const v = Number(val)
              const pct = a.total_cents > 0 ? (v / a.total_cents) * 100 : 0
              return (
                <tr
                  key={label as string}
                  className="border-t border-line"
                >
                  <td className="px-4 py-3">{label}</td>
                  <td className="text-right px-4 py-3">{formatCents(v)}</td>
                  <td className="text-right px-4 py-3 text-ink-muted">
                    {a.total_cents > 0 ? `${pct.toFixed(0)}%` : '—'}
                  </td>
                </tr>
              )
            })}
            <tr className="border-t border-line-strong font-sans text-[10px] uppercase tracking-[0.18em]">
              <td className="px-4 py-3">Total</td>
              <td className="text-right px-4 py-3">
                {formatCents(a.total_cents)}
              </td>
              <td className="px-4 py-3" />
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="font-serif text-[1.3rem] leading-tight mb-4">
        By project
      </h2>
      {projects.length === 0 ? (
        <EmptyState
          title="No project data yet"
          body="Create projects, send invoices, and log POs — the rollup will appear here."
          small
        />
      ) : (
        <div className="border border-line overflow-x-auto">
          <table className="w-full font-garamond text-[0.95rem]">
            <thead>
              <tr className="bg-ink/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                <th className="text-left px-4 py-3">Project</th>
                <th className="text-right px-4 py-3">Revenue</th>
                <th className="text-right px-4 py-3">COGS</th>
                <th className="text-right px-4 py-3">Expenses</th>
                <th className="text-right px-4 py-3">Profit</th>
                <th className="text-right px-4 py-3">Margin</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr
                  key={p.project_id}
                  className="border-t border-line hover:bg-ink/[0.03]"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/projects/${p.project_id}`}
                      className="hover:text-ink"
                    >
                      {p.project_name}
                    </Link>
                  </td>
                  <td className="text-right px-4 py-3">
                    {formatCents(p.revenue_cents)}
                  </td>
                  <td className="text-right px-4 py-3">
                    {formatCents(p.cogs_cents)}
                  </td>
                  <td className="text-right px-4 py-3">
                    {formatCents(p.expenses_cents)}
                  </td>
                  <td className="text-right px-4 py-3">
                    {formatCents(p.gross_profit_cents)}
                  </td>
                  <td className="text-right px-4 py-3">
                    {formatPercent(p.margin_pct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
