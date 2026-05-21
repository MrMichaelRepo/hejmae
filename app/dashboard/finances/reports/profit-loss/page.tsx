import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { getStudioFinanceSettings } from '@/lib/finances/studio_settings'
import { resolveBasis, resolvePeriod } from '@/lib/finances/period'
import { getPLStatement } from '@/lib/finances/rollup'
import { formatCents } from '@/lib/format'
import { PageHeader } from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { PeriodFilterBar } from '@/components/finances/PeriodFilter'
import type { PLLine } from '@/lib/finances/rollup'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function PLPage({ searchParams }: Props) {
  const ctx = await requireDesigner()
  requirePermission(ctx, 'finances:view')
  const settings = await getStudioFinanceSettings(ctx.studioId)

  const sp = await searchParams
  const period = resolvePeriod({
    searchParams: sp,
    fiscal_year_start_month: settings.fiscal_year_start_month,
  })
  const basis = resolveBasis(sp, settings.accounting_basis)

  const pl = await getPLStatement(ctx.designerId, {
    from: period.from,
    to: period.to,
    basis,
  })

  const exportHref = `/api/finances/reports/profit-loss.csv?from=${period.from ?? ''}&to=${period.to}&basis=${basis}`

  return (
    <div>
      <PageHeader
        eyebrow="Reports"
        title="Profit & Loss"
        subtitle={`${period.label} · ${basis} basis`}
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

      <Section title="Income">
        <PLTable lines={pl.income} totalLabel="Total income" total={pl.total_income_cents} />
      </Section>

      <Section title="Expenses">
        <PLTable lines={pl.expenses} totalLabel="Total expenses" total={pl.total_expenses_cents} />
      </Section>

      <div
        className="border border-line-strong p-6 mt-2 flex items-baseline justify-between"
      >
        <div>
          <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-1">
            Net income
          </div>
          <div className="font-garamond text-[0.9rem] text-ink-muted">
            Income minus expenses, before tax
          </div>
        </div>
        <div className="font-serif text-[2rem] leading-none">
          {formatCents(pl.net_income_cents)}
        </div>
      </div>
    </div>
  )
}

function PLTable({
  lines,
  totalLabel,
  total,
}: {
  lines: PLLine[]
  totalLabel: string
  total: number
}) {
  if (lines.length === 0) {
    return (
      <div className="border border-line p-6 font-garamond text-[0.95rem] text-ink-muted italic">
        No activity in this period.
      </div>
    )
  }
  return (
    <div className="border border-line overflow-x-auto">
      <table className="w-full font-garamond text-[0.95rem]">
        <thead>
          <tr className="bg-ink/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted">
            <th className="text-left px-4 py-3 w-24">Code</th>
            <th className="text-left px-4 py-3">Account</th>
            <th className="text-right px-4 py-3">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.account_id} className="border-t border-line">
              <td className="px-4 py-3 text-ink-muted">{l.account_code}</td>
              <td className="px-4 py-3">{l.account_name}</td>
              <td className="text-right px-4 py-3">
                {formatCents(l.amount_cents)}
              </td>
            </tr>
          ))}
          <tr className="border-t border-line-strong font-sans text-[10px] uppercase tracking-[0.18em]">
            <td className="px-4 py-3" />
            <td className="px-4 py-3">{totalLabel}</td>
            <td className="text-right px-4 py-3">{formatCents(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="font-serif text-[1.3rem] leading-tight mb-3">{title}</h2>
      {children}
    </section>
  )
}
