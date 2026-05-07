'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
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

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null)

  useEffect(() => {
    api
      .get<AccountRow[]>('/api/finances/accounts')
      .then((res) => setAccounts((res.data as AccountRow[]) ?? []))
  }, [])

  const grouped = useMemo(() => {
    const out = new Map<AccountType, AccountRow[]>()
    for (const t of TYPE_ORDER) out.set(t, [])
    for (const a of accounts ?? []) {
      const list = out.get(a.type)
      if (list) list.push(a)
    }
    for (const list of out.values()) {
      list.sort((x, y) => x.code.localeCompare(y.code))
    }
    return out
  }, [accounts])

  if (!accounts) return <PageSpinner />

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
