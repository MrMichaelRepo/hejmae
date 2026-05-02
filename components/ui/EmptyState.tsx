'use client'

export default function EmptyState({
  title,
  body,
  action,
  small,
}: {
  title: string
  body?: string
  action?: React.ReactNode
  small?: boolean
}) {
  return (
    <div
      className={[
        'border border-dashed border-hm-text/15 text-center',
        small ? 'p-8' : 'p-14',
      ].join(' ')}
    >
      <div className="font-serif text-[1.3rem] mb-2 leading-tight">{title}</div>
      {body ? (
        <p className="font-garamond text-[0.95rem] leading-[1.7] text-hm-nav max-w-md mx-auto mb-5">
          {body}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
      <div>
        {eyebrow ? (
          <div className="font-sans text-[10px] uppercase tracking-[0.26em] text-hm-nav mb-3">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="font-serif text-[clamp(1.7rem,2.6vw,2.4rem)] leading-[1.1] tracking-[-0.015em]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 font-garamond text-[1rem] leading-[1.7] text-hm-nav max-w-xl">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  )
}
