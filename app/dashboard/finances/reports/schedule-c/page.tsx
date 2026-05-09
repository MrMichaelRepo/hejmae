import Link from 'next/link'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { getScheduleCSummary } from '@/lib/finances/schedule_c'
import { formatCents } from '@/lib/format'
import { PageHeader } from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { StatGrid, StatTile } from '@/components/finances/SummaryTile'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ScheduleCPage({ searchParams }: Props) {
  const ctx = await requireDesigner()
  requirePermission(ctx, 'finances:view')

  const sp = await searchParams
  const yearParam = Array.isArray(sp.year) ? sp.year[0] : sp.year
  const taxYear = Number.isFinite(Number(yearParam))
    ? parseInt(yearParam!, 10)
    : new Date().getUTCFullYear()

  const summary = await getScheduleCSummary(ctx.designerId, taxYear)
  const exportHref = `/api/finances/reports/schedule-c.csv?year=${taxYear}`

  const yearOptions = [taxYear, taxYear - 1, taxYear - 2, taxYear - 3]

  return (
    <div>
      <PageHeader
        eyebrow="Reports"
        title="Schedule C summary"
        subtitle={`IRS Form 1040 Schedule C, tax year ${taxYear}. Hand this to your accountant.`}
        actions={
          <a href={exportHref} download>
            <Button variant="secondary">Export CSV</Button>
          </a>
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

      <StatGrid cols={4}>
        <StatTile
          label="Gross receipts"
          value={formatCents(summary.income_total_cents)}
          sub="Line 1 (less returns, line 2)"
        />
        <StatTile label="COGS" value={formatCents(summary.cogs_total_cents)} sub="Line 4" />
        <StatTile
          label="Expenses"
          value={formatCents(summary.expenses_total_cents)}
          sub="Lines 8–27"
        />
        <StatTile
          label="Tentative profit"
          value={formatCents(summary.tentative_profit_cents)}
          sub="Line 31"
          emphasis
        />
      </StatGrid>

      <h2 className="font-serif text-[1.3rem] leading-tight mb-3">By line</h2>
      <div className="border border-hm-text/10 overflow-x-auto mb-10">
        <table className="w-full font-garamond text-[0.95rem]">
          <thead>
            <tr className="bg-hm-text/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav">
              <th className="text-left px-4 py-3 w-32">IRS line</th>
              <th className="text-left px-4 py-3">Description</th>
              <th className="text-left px-4 py-3">Contributing accounts</th>
              <th className="text-right px-4 py-3">Amount</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center font-garamond text-hm-nav italic"
                >
                  No activity for {taxYear} yet.
                </td>
              </tr>
            ) : (
              summary.rows.map((r) => (
                <tr key={r.line ?? 'na'} className="border-t border-hm-text/10">
                  <td className="px-4 py-3 text-hm-nav">{r.irs_line}</td>
                  <td className="px-4 py-3">{r.label}</td>
                  <td className="px-4 py-3 text-hm-nav">
                    {r.contributing_accounts
                      .map((a) => `${a.code} ${a.name}`)
                      .join(', ')}
                  </td>
                  <td className="text-right px-4 py-3">
                    {formatCents(r.amount_cents)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {summary.unmapped.length > 0 ? (
        <section>
          <h2 className="font-serif text-[1.2rem] leading-tight mb-3">
            Unmapped accounts
          </h2>
          <p className="font-garamond text-[0.95rem] text-hm-nav mb-3 leading-[1.6]">
            These accounts had activity but no Schedule C line. Map them on
            the{' '}
            <Link
              href="/dashboard/finances/accounts"
              className="underline hover:text-hm-text"
            >
              Chart of accounts
            </Link>{' '}
            so they appear on next year&apos;s summary.
          </p>
          <div className="border border-amber-700/30 bg-amber-50/30 overflow-x-auto">
            <table className="w-full font-garamond text-[0.95rem]">
              <thead>
                <tr className="font-sans text-[10px] uppercase tracking-[0.18em] text-amber-900">
                  <th className="text-left px-4 py-3">Code</th>
                  <th className="text-left px-4 py-3">Account</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-right px-4 py-3">Amount</th>
                </tr>
              </thead>
              <tbody>
                {summary.unmapped.map((u) => (
                  <tr
                    key={u.id}
                    className="border-t border-amber-700/20 text-amber-950"
                  >
                    <td className="px-4 py-3">{u.code}</td>
                    <td className="px-4 py-3">{u.name}</td>
                    <td className="px-4 py-3">{u.type}</td>
                    <td className="text-right px-4 py-3">
                      {formatCents(u.amount_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
