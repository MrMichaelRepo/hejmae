'use client'

import { titleCase } from '@/lib/format'

const TONE: Record<string, string> = {
  neutral: 'border-hm-text/20 text-hm-nav',
  amber: 'border-amber-700/30 text-amber-800 bg-amber-50/30',
  green: 'border-emerald-700/30 text-emerald-800 bg-emerald-50/30',
  blue: 'border-sky-700/30 text-sky-800 bg-sky-50/30',
  red: 'border-red-700/30 text-red-800 bg-red-50/30',
  grey: 'border-hm-text/15 text-hm-nav/70',
}

const ITEM_STATUS: Record<string, keyof typeof TONE> = {
  sourcing: 'grey',
  approved: 'amber',
  ordered: 'green',
  received: 'blue',
  installed: 'blue',
}

const PROPOSAL_STATUS: Record<string, keyof typeof TONE> = {
  draft: 'grey',
  sent: 'amber',
  partially_approved: 'amber',
  fully_approved: 'green',
}

const INVOICE_STATUS: Record<string, keyof typeof TONE> = {
  draft: 'grey',
  sent: 'amber',
  partially_paid: 'amber',
  paid: 'green',
}

const PO_STATUS: Record<string, keyof typeof TONE> = {
  draft: 'grey',
  sent: 'amber',
  acknowledged: 'amber',
  partially_received: 'blue',
  complete: 'green',
}

const PROJECT_STATUS: Record<string, keyof typeof TONE> = {
  active: 'green',
  completed: 'blue',
  archived: 'grey',
}

export function StatusBadge({
  kind,
  status,
}: {
  kind: 'item' | 'proposal' | 'invoice' | 'po' | 'project'
  status: string
}) {
  const map =
    kind === 'item'
      ? ITEM_STATUS
      : kind === 'proposal'
      ? PROPOSAL_STATUS
      : kind === 'invoice'
      ? INVOICE_STATUS
      : kind === 'po'
      ? PO_STATUS
      : PROJECT_STATUS
  const tone = map[status] ?? 'neutral'
  return (
    <span
      className={[
        'inline-flex items-center font-sans text-[10px] uppercase tracking-[0.18em] px-2.5 py-1 rounded-sm border',
        TONE[tone],
      ].join(' ')}
    >
      {titleCase(status)}
    </span>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode
  tone?: keyof typeof TONE
}) {
  return (
    <span
      className={[
        'inline-flex items-center font-sans text-[10px] uppercase tracking-[0.18em] px-2.5 py-1 rounded-sm border',
        TONE[tone],
      ].join(' ')}
    >
      {children}
    </span>
  )
}
