'use client'

import Button from '@/components/ui/Button'

/**
 * First-run empty state for /dashboard/projects.
 * Renders a magazine-spread preview of a sample project so the page never
 * looks "broken" — even a brand-new studio sees the shape of the feature.
 */
export default function ProjectsEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="grid md:grid-cols-2 gap-8 items-center border border-line rounded-lg bg-bg-elevated/40 p-10">
      <div>
        <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-subtle mb-3">
          Sourcing · Proposals · Invoicing
        </div>
        <h2 className="font-serif text-[1.7rem] leading-[1.15] tracking-[-0.01em] mb-3">
          Your first project lives here.
        </h2>
        <p className="font-garamond text-[1.02rem] leading-[1.65] text-ink-muted mb-6 max-w-md">
          Every project is one place — clippings become items, items roll up
          into proposals and purchase orders, time gets billed against the
          same record. Start with a client and a room list, and the rest
          fills in as you work.
        </p>
        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={onCreate}>
            Create first project
          </Button>
          <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
            ⌘K · New project
          </span>
        </div>
      </div>

      {/* Sample row preview — same shape as the real list, but obviously a stand-in. */}
      <div className="border border-line rounded bg-surface overflow-hidden">
        <SampleRow
          name="Westlake Residence"
          subtitle="The Hayworths · Austin, TX"
          status="Active"
          tone="sage"
        />
        <SampleRow
          name="Penthouse Refresh"
          subtitle="Karim Family · Brooklyn Heights"
          status="Active"
          tone="sage"
          divider
        />
        <SampleRow
          name="Lake House"
          subtitle="Yamada Studio · Tahoe"
          status="Completed"
          tone="terra"
          divider
        />
        <div className="font-sans text-[9px] uppercase tracking-[0.2em] text-ink-subtle text-center py-2 border-t border-line">
          Preview
        </div>
      </div>
    </div>
  )
}

function SampleRow({
  name,
  subtitle,
  status,
  tone,
  divider,
}: {
  name: string
  subtitle: string
  status: string
  tone: 'sage' | 'terra'
  divider?: boolean
}) {
  const toneCls =
    tone === 'sage'
      ? 'border-success/30 text-success bg-success-soft/50'
      : 'border-accent/30 text-accent bg-accent-soft/50'
  return (
    <div className={['flex items-center justify-between px-5 py-4', divider ? 'border-t border-line' : ''].join(' ')}>
      <div>
        <div className="font-serif text-[1rem] leading-tight">{name}</div>
        <div className="font-garamond text-[0.85rem] text-ink-muted mt-0.5">{subtitle}</div>
      </div>
      <span
        className={[
          'inline-flex items-center font-sans text-[9px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-sm border',
          toneCls,
        ].join(' ')}
      >
        {status}
      </span>
    </div>
  )
}
