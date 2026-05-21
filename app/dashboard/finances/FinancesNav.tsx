'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS: Array<[string, string]> = [
  ['Overview', '/dashboard/finances'],
  ['Expenses', '/dashboard/finances/expenses'],
  ['Mileage', '/dashboard/finances/mileage'],
  ['Ledger', '/dashboard/finances/ledger'],
  ['Accounts', '/dashboard/finances/accounts'],
  ['Banking', '/dashboard/finances/banking'],
  ['Reports', '/dashboard/finances/reports'],
  ['Taxes', '/dashboard/finances/taxes'],
]

export default function FinancesNav() {
  const pathname = usePathname()
  return (
    <div className="border-b border-line mb-8 -mt-2">
      <div className="flex gap-1 overflow-x-auto">
        {TABS.map(([label, href]) => {
          const active =
            href === '/dashboard/finances'
              ? pathname === '/dashboard/finances'
              : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={[
                'font-sans text-[10px] uppercase tracking-[0.22em] px-4 py-3 -mb-px border-b-2 transition-colors whitespace-nowrap',
                active
                  ? 'text-ink border-ink'
                  : 'text-ink-muted border-transparent hover:text-ink',
              ].join(' ')}
            >
              {label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
