import Link from 'next/link'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { getForm1099Summary } from '@/lib/finances/form_1099'
import { formatCents } from '@/lib/format'
import { PageHeader } from '@/components/ui/EmptyState'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { StatGrid, StatTile } from '@/components/finances/SummaryTile'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function Form1099Page({ searchParams }: Props) {
  const ctx = await requireDesigner()
  requirePermission(ctx, 'finances:view')

  const sp = await searchParams
  const yearParam = Array.isArray(sp.year) ? sp.year[0] : sp.year
  const taxYear = Number.isFinite(Number(yearParam))
    ? parseInt(yearParam!, 10)
    : new Date().getUTCFullYear()

  const summary = await getForm1099Summary(ctx.designerId, taxYear)
  const yearOptions = [taxYear, taxYear - 1, taxYear - 2, taxYear - 3]

  const needsCount = summary.rows.filter((r) => r.needs_1099).length
  const flaggedCount = summary.rows.filter((r) => r.threshold_unflagged).length
  const totalReportable = summary.rows
    .filter((r) => r.needs_1099)
    .reduce((a, r) => a + r.ytd_paid_cents, 0)

  return (
    <div>
      <PageHeader
        eyebrow="Reports"
        title="1099-NEC vendors"
        subtitle={`Vendor totals for ${taxYear}. Anyone paid $600+ in non-employee compensation needs a 1099-NEC by Jan 31.`}
        actions={
          <a
            href={`/api/finances/reports/1099.csv?year=${taxYear}`}
            download
          >
            <Button variant="secondary">Export CSV</Button>
          </a>
        }
      />

      <div className="flex items-center gap-3 mb-6 pb-6 border-b border-line">
        <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted">
          Tax year
        </span>
        <div className="inline-flex border border-line rounded-sm overflow-hidden">
          {yearOptions.map((y) => (
            <Link
              key={y}
              href={`?year=${y}`}
              className={[
                'px-4 py-2 font-sans text-[10px] uppercase tracking-[0.2em] transition-colors',
                y === taxYear
                  ? 'bg-ink text-bg'
                  : 'text-ink-muted hover:text-ink',
              ].join(' ')}
            >
              {y}
            </Link>
          ))}
        </div>
      </div>

      <StatGrid cols={3}>
        <StatTile
          label="Vendors needing 1099"
          value={String(needsCount)}
          sub={`Flagged eligible AND paid ≥ $600`}
        />
        <StatTile
          label="Total reportable"
          value={formatCents(totalReportable)}
          sub="Across all 1099-NEC vendors"
        />
        <StatTile
          label="Unflagged ≥ $600"
          value={String(flaggedCount)}
          sub={
            flaggedCount > 0
              ? 'Review below — may need 1099 too'
              : 'No suspicious totals'
          }
        />
      </StatGrid>

      <p className="font-garamond text-[0.95rem] text-ink-muted mb-4 leading-[1.6]">
        Excludes expenses paid by credit card or Stripe — those are reported
        on 1099-K by the processor, not by you. Mark a vendor as 1099-eligible
        in the{' '}
        <Link href="/dashboard/vendors" className="underline hover:text-ink">
          Vendors directory
        </Link>{' '}
        and capture their W-9 (legal name, address, TIN) before issuing.
      </p>

      {summary.rows.length === 0 ? (
        <EmptyState
          title="No 1099 activity"
          body="Mark vendors as 1099-eligible in the directory and they'll appear here as you accumulate payments."
          small
        />
      ) : (
        <div className="border border-line overflow-x-auto">
          <table className="w-full font-garamond text-[0.95rem]">
            <thead>
              <tr className="bg-ink/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                <th className="text-left px-4 py-3">Vendor</th>
                <th className="text-left px-4 py-3">Legal name (W-9)</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">{taxYear} paid</th>
                <th className="text-right px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((r) => (
                <tr
                  key={r.vendor_id}
                  className="border-t border-line hover:bg-ink/[0.03]"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/vendors`}
                      className="hover:text-ink"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {r.legal_name ?? (
                      <span className="italic text-ink-subtle">
                        not on file
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.needs_1099 ? (
                      <span className="font-sans text-[10px] uppercase tracking-[0.2em] text-success">
                        1099 required
                      </span>
                    ) : r.threshold_unflagged ? (
                      <span className="font-sans text-[10px] uppercase tracking-[0.2em] text-warn">
                        Review
                      </span>
                    ) : r.is_1099_eligible ? (
                      <span className="font-sans text-[10px] uppercase tracking-[0.2em] text-ink-muted">
                        Below threshold
                      </span>
                    ) : (
                      <span className="font-sans text-[10px] uppercase tracking-[0.2em] text-ink-subtle">
                        Not eligible
                      </span>
                    )}
                  </td>
                  <td className="text-right px-4 py-3">
                    {formatCents(r.ytd_paid_cents)}
                  </td>
                  <td className="text-right px-4 py-3 text-ink-muted text-[0.85rem]">
                    {r.needs_1099 && !r.has_tax_id
                      ? 'Missing TIN'
                      : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summary.unmatched_count > 0 ? (
        <div className="mt-6 border border-warn/30 bg-warn-soft/40/30 p-5">
          <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-warn mb-2">
            Free-text vendors
          </div>
          <p className="font-garamond text-[0.95rem] text-warn leading-[1.6]">
            {summary.unmatched_count} expense
            {summary.unmatched_count === 1 ? '' : 's'} totaling{' '}
            <span className="font-semibold">
              {formatCents(summary.unmatched_total_cents)}
            </span>{' '}
            were entered with a free-text vendor name (no vendor record). For
            1099 reporting, link these to a vendor in the directory or create
            new vendor records.
          </p>
        </div>
      ) : null}
    </div>
  )
}
