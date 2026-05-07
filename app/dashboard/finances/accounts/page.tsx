import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/EmptyState'
import type { AccountRow, AccountType } from '@/lib/supabase/types'

const TYPE_ORDER: AccountType[] = [
  'asset',
  'liability',
  'equity',
  'income',
  'expense',
]
const TYPE_LABEL: Record<AccountType, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  income: 'Income',
  expense: 'Expenses',
}

export default async function AccountsPage() {
  const { designerId, role, permissions } = await requireDesigner()
  requirePermission({ role, permissions }, 'finances:view')

  const { data } = await supabaseAdmin()
    .from('accounts')
    .select('*')
    .eq('designer_id', designerId)
    .order('code', { ascending: true })

  const accounts = (data ?? []) as AccountRow[]
  const grouped = new Map<AccountType, AccountRow[]>()
  for (const t of TYPE_ORDER) grouped.set(t, [])
  for (const a of accounts) grouped.get(a.type)?.push(a)

  return (
    <div>
      <PageHeader
        eyebrow="Bookkeeping"
        title="Chart of accounts"
        subtitle="The categories every dollar flows through. Seeded with a Schedule-C friendly default; the system_key column is what auto-posting wires up to."
      />

      <div className="space-y-10">
        {TYPE_ORDER.map((type) => {
          const rows = grouped.get(type) ?? []
          if (rows.length === 0) return null
          return (
            <section key={type}>
              <h2 className="font-serif text-[1.2rem] mb-3">{TYPE_LABEL[type]}</h2>
              <div className="border border-hm-text/10 overflow-x-auto">
                <table className="w-full font-garamond text-[0.95rem]">
                  <thead>
                    <tr className="bg-hm-text/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav">
                      <th className="text-left px-4 py-3 w-24">Code</th>
                      <th className="text-left px-4 py-3">Name</th>
                      <th className="text-left px-4 py-3">System key</th>
                      <th className="text-left px-4 py-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr
                        key={a.id}
                        className="border-t border-hm-text/10"
                      >
                        <td className="px-4 py-3 text-hm-nav">{a.code}</td>
                        <td className="px-4 py-3">{a.name}</td>
                        <td className="px-4 py-3 text-hm-nav">
                          {a.system_key ?? (
                            <span className="text-hm-nav/40 italic">
                              custom
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-hm-nav">
                          {a.description ?? ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
