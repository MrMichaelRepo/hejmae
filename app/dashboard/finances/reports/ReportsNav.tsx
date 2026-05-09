'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS: Array<[string, string]> = [
  ['Profit & Loss', '/dashboard/finances/reports/profit-loss'],
  ['Trial balance', '/dashboard/finances/reports/trial-balance'],
  ['AR aging', '/dashboard/finances/reports/aging'],
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
                  ? 'border-hm-text text-hm-text bg-hm-text/[0.04]'
                  : 'border-hm-text/15 text-hm-nav hover:text-hm-text',
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
