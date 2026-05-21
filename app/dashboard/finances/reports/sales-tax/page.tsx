import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { buildSalesTaxReport } from '@/lib/finances/sales_tax'
import { formatCents, formatDate } from '@/lib/format'
import { PageHeader } from '@/components/ui/EmptyState'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/

export default async function SalesTaxPage({ searchParams }: Props) {
  const ctx = await requireDesigner()
  requirePermission(ctx, 'finances:view')
  const sp = await searchParams
  const today = new Date().toISOString().slice(0, 10)
  const ytdStart = today.slice(0, 4) + '-01-01'
  const fromRaw = typeof sp.from === 'string' ? sp.from : undefined
  const toRaw = typeof sp.to === 'string' ? sp.to : undefined
  const from = fromRaw && dateRe.test(fromRaw) ? fromRaw : ytdStart
  const to = toRaw && dateRe.test(toRaw) ? toRaw : today
  const report = await buildSalesTaxReport(ctx.designerId, from, to)

  return (
    <div>
      <PageHeader
        eyebrow="Reports"
        title="Sales tax liability"
        subtitle={`Tax collected on sent / paid invoices from ${formatDate(report.from)} through ${formatDate(report.to)}. Remittance is whatever you posted to the Sales Tax Payable account in the period.`}
      />

      <form className="mb-6 flex items-end gap-3" method="get">
        <label className="font-garamond text-[0.9rem]">
          <span className="block font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-1">
            From
          </span>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="border border-line-strong px-3 py-2 bg-bg"
          />
        </label>
        <label className="font-garamond text-[0.9rem]">
          <span className="block font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-1">
            To
          </span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="border border-line-strong px-3 py-2 bg-bg"
          />
        </label>
        <button
          type="submit"
          className="font-sans text-[10px] uppercase tracking-[0.22em] border border-line-strong px-4 py-2 hover:bg-ink hover:text-bg transition-colors"
        >
          Apply
        </button>
      </form>

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <SummaryCard
          label="Tax collected"
          value={formatCents(report.totals.tax_collected_cents)}
        />
        <SummaryCard
          label="Tax remitted"
          value={formatCents(report.totals.tax_remitted_cents)}
        />
        <SummaryCard
          label="Net for period"
          value={formatCents(report.totals.period_outstanding_cents)}
        />
        <SummaryCard
          label="Total liability (all time)"
          value={formatCents(report.totals.all_time_liability_cents)}
        />
      </div>

      <div className="border border-line overflow-x-auto">
        <table className="w-full font-garamond text-[0.95rem]">
          <thead>
            <tr className="bg-ink/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted">
              <th className="text-left px-4 py-3 w-20">State</th>
              <th className="text-right px-4 py-3">Invoices</th>
              <th className="text-right px-4 py-3">Taxable sales</th>
              <th className="text-right px-4 py-3">Exempt sales</th>
              <th className="text-right px-4 py-3">Avg rate</th>
              <th className="text-right px-4 py-3">Tax collected</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-ink-muted italic">
                  No tax-bearing invoices in this period.
                </td>
              </tr>
            ) : (
              report.rows.map((r, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-4 py-3 font-mono">{r.state_code ?? '—'}</td>
                  <td className="text-right px-4 py-3">{r.invoice_count}</td>
                  <td className="text-right px-4 py-3">
                    {formatCents(r.taxable_sales_cents)}
                  </td>
                  <td className="text-right px-4 py-3 text-ink-muted">
                    {formatCents(r.exempt_sales_cents)}
                  </td>
                  <td className="text-right px-4 py-3 text-ink-muted">
                    {r.avg_rate_bps !== null
                      ? `${(r.avg_rate_bps / 100).toFixed(2)}%`
                      : '—'}
                  </td>
                  <td className="text-right px-4 py-3">
                    {formatCents(r.tax_collected_cents)}
                  </td>
                </tr>
              ))
            )}
            <tr className="border-t border-line-strong font-sans text-[10px] uppercase tracking-[0.18em]">
              <td className="px-4 py-3">Total</td>
              <td className="text-right px-4 py-3">
                {report.totals.invoice_count}
              </td>
              <td className="text-right px-4 py-3">
                {formatCents(report.totals.taxable_sales_cents)}
              </td>
              <td className="text-right px-4 py-3 text-ink-muted">
                {formatCents(report.totals.exempt_sales_cents)}
              </td>
              <td />
              <td className="text-right px-4 py-3">
                {formatCents(report.totals.tax_collected_cents)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-4 font-garamond text-[0.85rem] text-ink-muted leading-[1.55]">
        Remit sales tax to your state by posting a manual journal entry —
        debit{' '}
        <code className="font-mono text-[0.85rem]">Sales Tax Payable</code>{' '}
        and credit whichever bank account paid. That activity shows up under
        &ldquo;Tax remitted&rdquo; for the period.
      </p>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line p-4">
      <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-1">
        {label}
      </div>
      <div className="font-serif text-[1.3rem]">{value}</div>
    </div>
  )
}
