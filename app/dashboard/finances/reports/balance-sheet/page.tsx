import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { buildBalanceSheet } from '@/lib/finances/balance_sheet'
import { formatCents, formatDate } from '@/lib/format'
import { PageHeader } from '@/components/ui/EmptyState'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/

export default async function BalanceSheetPage({ searchParams }: Props) {
  const ctx = await requireDesigner()
  requirePermission(ctx, 'finances:view')
  const sp = await searchParams
  const raw = typeof sp.as_of === 'string' ? sp.as_of : undefined
  const asOf = raw && dateRe.test(raw) ? raw : new Date().toISOString().slice(0, 10)
  const bs = await buildBalanceSheet(ctx.designerId, asOf)

  return (
    <div>
      <PageHeader
        eyebrow="Reports"
        title="Balance sheet"
        subtitle={`Account balances as of ${formatDate(asOf)}.`}
      />

      <form className="mb-6 flex items-end gap-3" method="get">
        <label className="font-garamond text-[0.9rem]">
          <span className="block font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-1">
            As of
          </span>
          <input
            type="date"
            name="as_of"
            defaultValue={asOf}
            className="border border-hm-text/20 px-3 py-2 bg-bg"
          />
        </label>
        <button
          type="submit"
          className="font-sans text-[10px] uppercase tracking-[0.22em] border border-hm-text/25 px-4 py-2 hover:bg-hm-text hover:text-bg transition-colors"
        >
          Apply
        </button>
      </form>

      <div className="grid gap-6 md:grid-cols-2">
        <Section
          title="Assets"
          lines={bs.assets.lines}
          subtotalLabel="Total assets"
          subtotalCents={bs.totalAssetsCents}
        />
        <div>
          <Section
            title="Liabilities"
            lines={bs.liabilities.lines}
            subtotalLabel="Total liabilities"
            subtotalCents={bs.liabilities.total_cents}
          />
          <div className="mt-6">
            <Section
              title="Equity"
              lines={[
                ...bs.equity.lines,
                {
                  account_id: '__open__',
                  code: '—',
                  name: 'Open earnings (un-closed)',
                  balance_cents: bs.openEarningsCents,
                },
              ]}
              subtotalLabel="Total equity"
              subtotalCents={bs.equity.total_cents + bs.openEarningsCents}
            />
          </div>
        </div>
      </div>

      <div className="mt-8 border border-hm-text/30 p-6 flex items-baseline justify-between">
        <div>
          <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-1">
            Balance check
          </div>
          <div className="font-garamond text-[0.9rem] text-hm-nav">
            {bs.balanced
              ? 'Assets = Liabilities + Equity + Open earnings ✓'
              : 'Out of balance — see trial balance / audit trail.'}
          </div>
        </div>
        <div className="text-right font-serif text-[1.4rem] leading-none">
          <div>{formatCents(bs.totalAssetsCents)}</div>
          <div className="text-hm-nav text-[0.95rem] font-garamond mt-1">
            {formatCents(bs.totalLiabilitiesAndEquityCents)} L+E
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  lines,
  subtotalLabel,
  subtotalCents,
}: {
  title: string
  lines: Array<{ account_id: string; code: string; name: string; balance_cents: number }>
  subtotalLabel: string
  subtotalCents: number
}) {
  return (
    <section>
      <h2 className="font-serif text-[1.2rem] leading-tight mb-3">{title}</h2>
      <div className="border border-hm-text/10 overflow-x-auto">
        <table className="w-full font-garamond text-[0.95rem]">
          <thead>
            <tr className="bg-hm-text/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav">
              <th className="text-left px-4 py-3 w-24">Code</th>
              <th className="text-left px-4 py-3">Account</th>
              <th className="text-right px-4 py-3">Balance</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr className="border-t border-hm-text/10">
                <td colSpan={3} className="px-4 py-3 text-hm-nav italic">
                  No balances.
                </td>
              </tr>
            ) : (
              lines.map((l) => (
                <tr key={l.account_id} className="border-t border-hm-text/10">
                  <td className="px-4 py-3 text-hm-nav">{l.code}</td>
                  <td className="px-4 py-3">{l.name}</td>
                  <td className="text-right px-4 py-3">{formatCents(l.balance_cents)}</td>
                </tr>
              ))
            )}
            <tr className="border-t border-hm-text/30 font-sans text-[10px] uppercase tracking-[0.18em]">
              <td className="px-4 py-3" />
              <td className="px-4 py-3">{subtotalLabel}</td>
              <td className="text-right px-4 py-3">{formatCents(subtotalCents)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}
