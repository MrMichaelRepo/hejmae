import Link from 'next/link'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { getStudioFinanceSettings } from '@/lib/finances/studio_settings'
import { resolvePeriod } from '@/lib/finances/period'
import { getAgingDetail } from '@/lib/finances/aging'
import { formatCents, formatDate } from '@/lib/format'
import { PageHeader } from '@/components/ui/EmptyState'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { PeriodFilterBar } from '@/components/finances/PeriodFilter'
import { StatGrid, StatTile } from '@/components/finances/SummaryTile'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const BUCKET_LABEL: Record<string, string> = {
  current_cents: 'Current (0–30)',
  bucket_31_60_cents: '31–60 days',
  bucket_61_90_cents: '61–90 days',
  bucket_over_90_cents: 'Over 90 days',
}

export default async function AgingPage({ searchParams }: Props) {
  const ctx = await requireDesigner()
  requirePermission(ctx, 'finances:view')
  const settings = await getStudioFinanceSettings(ctx.studioId)

  const sp = await searchParams
  const period = resolvePeriod({
    searchParams: sp,
    fiscal_year_start_month: settings.fiscal_year_start_month,
  })

  const rows = await getAgingDetail(ctx.designerId, period.to)

  const bucketTotals: Record<string, number> = {
    current_cents: 0,
    bucket_31_60_cents: 0,
    bucket_61_90_cents: 0,
    bucket_over_90_cents: 0,
  }
  for (const r of rows) bucketTotals[r.bucket] += r.outstanding_cents
  const total = rows.reduce((a, r) => a + r.outstanding_cents, 0)

  return (
    <div>
      <PageHeader
        eyebrow="Reports"
        title="AR aging"
        subtitle={`Open invoices as of ${formatDate(period.to)}.`}
        actions={
          <a
            href={`/api/finances/reports/aging.csv?as_of=${period.to}`}
            download
          >
            <Button variant="secondary">Export CSV</Button>
          </a>
        }
      />

      <PeriodFilterBar
        periodKey={period.key}
        basis="cash"
        studioBasis={settings.accounting_basis}
        rangeLabel={`As of ${period.to}`}
        showBasis={false}
        studioFiscalYearStartMonth={settings.fiscal_year_start_month}
      />

      <StatGrid cols={4}>
        {Object.entries(BUCKET_LABEL).map(([k, label]) => (
          <StatTile
            key={k}
            label={label}
            value={formatCents(bucketTotals[k])}
            sub={total > 0 ? `${Math.round((bucketTotals[k] / total) * 100)}% of open` : null}
          />
        ))}
      </StatGrid>

      {rows.length === 0 ? (
        <EmptyState
          title="No open invoices"
          body="Every sent invoice has been paid in full as of this date."
          small
        />
      ) : (
        <div className="border border-hm-text/10 overflow-x-auto">
          <table className="w-full font-garamond text-[0.95rem]">
            <thead>
              <tr className="bg-hm-text/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav">
                <th className="text-left px-4 py-3">Invoice</th>
                <th className="text-left px-4 py-3">Client</th>
                <th className="text-left px-4 py-3">Sent</th>
                <th className="text-right px-4 py-3">Days out</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-right px-4 py-3">Paid</th>
                <th className="text-right px-4 py-3">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.invoice_id}
                  className="border-t border-hm-text/10 hover:bg-hm-text/[0.02]"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/projects/${r.project_id}/invoices/${r.invoice_id}`}
                      className="hover:text-hm-text"
                    >
                      {r.invoice_number_display}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-hm-nav">
                    {r.client_name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-hm-nav whitespace-nowrap">
                    {formatDate(r.sent_at)}
                  </td>
                  <td className="text-right px-4 py-3">
                    <span
                      className={
                        r.bucket === 'bucket_over_90_cents'
                          ? 'text-red-700'
                          : r.bucket === 'bucket_61_90_cents'
                            ? 'text-amber-700'
                            : 'text-hm-text'
                      }
                    >
                      {r.days_outstanding}
                    </span>
                  </td>
                  <td className="text-right px-4 py-3">
                    {formatCents(r.total_cents)}
                  </td>
                  <td className="text-right px-4 py-3 text-hm-nav">
                    {formatCents(r.paid_cents)}
                  </td>
                  <td className="text-right px-4 py-3">
                    {formatCents(r.outstanding_cents)}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-hm-text/30 font-sans text-[10px] uppercase tracking-[0.18em]">
                <td className="px-4 py-3" colSpan={6}>
                  Total
                </td>
                <td className="text-right px-4 py-3">{formatCents(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
