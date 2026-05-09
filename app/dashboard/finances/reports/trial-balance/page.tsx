import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { getStudioFinanceSettings } from '@/lib/finances/studio_settings'
import { resolvePeriod } from '@/lib/finances/period'
import { getTrialBalance } from '@/lib/finances/rollup'
import { formatCents, formatDate } from '@/lib/format'
import { PageHeader } from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { PeriodFilterBar } from '@/components/finances/PeriodFilter'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const TYPE_ORDER = ['asset', 'liability', 'equity', 'income', 'expense']
const TYPE_LABEL: Record<string, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  income: 'Income',
  expense: 'Expenses',
}

export default async function TrialBalancePage({ searchParams }: Props) {
  const ctx = await requireDesigner()
  requirePermission(ctx, 'finances:view')
  const settings = await getStudioFinanceSettings(ctx.studioId)

  const sp = await searchParams
  const period = resolvePeriod({
    searchParams: sp,
    fiscal_year_start_month: settings.fiscal_year_start_month,
  })

  const tb = await getTrialBalance(ctx.designerId, period.to)
  const exportHref = `/api/finances/reports/trial-balance.csv?as_of=${period.to}`

  const grouped = new Map<string, typeof tb.lines>()
  for (const t of TYPE_ORDER) grouped.set(t, [])
  for (const l of tb.lines) {
    const arr = grouped.get(l.type) ?? []
    arr.push(l)
    grouped.set(l.type, arr)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Reports"
        title="Trial balance"
        subtitle={`Account balances as of ${formatDate(period.to)}.`}
        actions={
          <a href={exportHref} download>
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

      {tb.lines.length === 0 ? (
        <div className="border border-hm-text/10 p-6 font-garamond text-[0.95rem] text-hm-nav italic">
          No journal activity yet.
        </div>
      ) : (
        <div className="space-y-8">
          {TYPE_ORDER.map((t) => {
            const rows = grouped.get(t) ?? []
            if (rows.length === 0) return null
            const debits = rows.reduce((a, l) => a + l.debit_cents, 0)
            const credits = rows.reduce((a, l) => a + l.credit_cents, 0)
            return (
              <section key={t}>
                <h2 className="font-serif text-[1.2rem] leading-tight mb-3">
                  {TYPE_LABEL[t]}
                </h2>
                <div className="border border-hm-text/10 overflow-x-auto">
                  <table className="w-full font-garamond text-[0.95rem]">
                    <thead>
                      <tr className="bg-hm-text/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav">
                        <th className="text-left px-4 py-3 w-24">Code</th>
                        <th className="text-left px-4 py-3">Account</th>
                        <th className="text-right px-4 py-3">Debit</th>
                        <th className="text-right px-4 py-3">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((l) => (
                        <tr key={l.account_id} className="border-t border-hm-text/10">
                          <td className="px-4 py-3 text-hm-nav">{l.account_code}</td>
                          <td className="px-4 py-3">{l.account_name}</td>
                          <td className="text-right px-4 py-3">
                            {l.debit_cents > 0 ? formatCents(l.debit_cents) : ''}
                          </td>
                          <td className="text-right px-4 py-3">
                            {l.credit_cents > 0 ? formatCents(l.credit_cents) : ''}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-hm-text/30 font-sans text-[10px] uppercase tracking-[0.18em]">
                        <td className="px-4 py-3" />
                        <td className="px-4 py-3">Subtotal</td>
                        <td className="text-right px-4 py-3">
                          {formatCents(debits)}
                        </td>
                        <td className="text-right px-4 py-3">
                          {formatCents(credits)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })}

          <div className="border border-hm-text/30 p-6 flex items-baseline justify-between">
            <div>
              <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-1">
                Trial balance
              </div>
              <div className="font-garamond text-[0.9rem] text-hm-nav">
                {tb.total_debits_cents === tb.total_credits_cents
                  ? 'Books balance ✓'
                  : 'Out of balance — open a manual entry to investigate.'}
              </div>
            </div>
            <div className="text-right font-serif text-[1.4rem] leading-none">
              <div>{formatCents(tb.total_debits_cents)}</div>
              <div className="text-hm-nav text-[0.95rem] font-garamond mt-1">
                {formatCents(tb.total_credits_cents)} credits
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
