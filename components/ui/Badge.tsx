'use client'

import { titleCase } from '@/lib/format'

// Earthy palette — never the bright Tailwind defaults. These badges live
// inside a cream world; status colors should belong to it, not interrupt it.
const TONE: Record<string, string> = {
  neutral: 'border-line text-ink-muted bg-bg-elevated',
  grey:    'border-line text-ink-subtle bg-transparent',
  sage:    'border-success/30 text-success bg-success-soft/50',
  amber:   'border-warn/30 text-warn bg-warn-soft/50',
  brick:   'border-danger/30 text-danger bg-danger-soft/50',
  terra:   'border-accent/30 text-accent bg-accent-soft/50',
  // Back-compat aliases — older call sites map color words → earthy tones
  green: 'border-success/30 text-success bg-success-soft/50',
  blue:  'border-accent/30 text-accent bg-accent-soft/50',
  red:   'border-danger/30 text-danger bg-danger-soft/50',
}

const ITEM_STATUS: Record<string, keyof typeof TONE> = {
  sourcing:  'grey',
  approved:  'amber',
  ordered:   'sage',
  received:  'terra',
  installed: 'terra',
}

const PROPOSAL_STATUS: Record<string, keyof typeof TONE> = {
  draft:               'grey',
  sent:                'amber',
  partially_approved:  'amber',
  fully_approved:      'sage',
}

const INVOICE_STATUS: Record<string, keyof typeof TONE> = {
  draft:          'grey',
  sent:           'amber',
  partially_paid: 'amber',
  paid:           'sage',
}

const PO_STATUS: Record<string, keyof typeof TONE> = {
  draft:               'grey',
  sent:                'amber',
  acknowledged:        'amber',
  partially_received:  'terra',
  complete:            'sage',
}

const PROJECT_STATUS: Record<string, keyof typeof TONE> = {
  active:    'sage',
  completed: 'terra',
  archived:  'grey',
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
