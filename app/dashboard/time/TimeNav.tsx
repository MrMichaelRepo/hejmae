'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Props {
  showTeam: boolean
}

export default function TimeNav({ showTeam }: Props) {
  const pathname = usePathname()
  const tabs: Array<[string, string]> = [['My time', '/dashboard/time']]
  if (showTeam) tabs.push(['Team', '/dashboard/time/team'])
  tabs.push(['Reports', '/dashboard/time/reports'])

  return (
    <div className="border-b border-line mb-8 -mt-2">
      <div className="flex gap-1">
        {tabs.map(([label, href]) => {
          const active =
            href === '/dashboard/time'
              ? pathname === '/dashboard/time'
              : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={[
                'font-sans text-[10px] uppercase tracking-[0.22em] px-4 py-3 -mb-px border-b-2 transition-colors',
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
