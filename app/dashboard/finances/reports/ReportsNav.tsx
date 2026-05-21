'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS: Array<[string, string]> = [
  ['Profit & Loss', '/dashboard/finances/reports/profit-loss'],
  ['Balance sheet', '/dashboard/finances/reports/balance-sheet'],
  ['Trial balance', '/dashboard/finances/reports/trial-balance'],
  ['Cash flow forecast', '/dashboard/finances/reports/cash-flow'],
  ['Cash flow statement', '/dashboard/finances/reports/cash-flow-statement'],
  ['AR aging', '/dashboard/finances/reports/aging'],
  ['Sales tax', '/dashboard/finances/reports/sales-tax'],
  ['Schedule C', '/dashboard/finances/reports/schedule-c'],
  ['1099 vendors', '/dashboard/finances/reports/1099'],
]

export default function ReportsNav() {
  const pathname = usePathname()
  return (
    <div className="mb-8">
      <div className="flex flex-wrap gap-1">
        {TABS.map(([label, href]) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={[
                'font-sans text-[10px] uppercase tracking-[0.22em] px-4 py-2 border rounded-sm transition-colors',
                active
                  ? 'border-ink text-ink bg-ink/[0.04]'
                  : 'border-line text-ink-muted hover:text-ink',
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
