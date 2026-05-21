'use client'

type Tone = 'danger' | 'warn' | 'success' | 'info'

const TONE_CLASSES: Record<Tone, string> = {
  danger: 'border-danger/30 bg-danger-soft/50 text-danger',
  warn: 'border-warn/30 bg-warn-soft/50 text-warn',
  success: 'border-success/30 bg-success-soft/50 text-success',
  info: 'border-line bg-bg-elevated text-ink-muted',
}

export default function Alert({
  tone = 'danger',
  title,
  children,
  className = '',
}: {
  tone?: Tone
  title?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      role={tone === 'danger' || tone === 'warn' ? 'alert' : 'status'}
      className={[
        'border rounded-sm px-4 py-3 font-garamond text-[0.95rem] leading-snug',
        TONE_CLASSES[tone],
        className,
      ].join(' ')}
    >
      {title ? (
        <div className="font-sans text-[10px] uppercase tracking-[0.2em] mb-1">
          {title}
        </div>
      ) : null}
      {children ? <div className="text-ink/90">{children}</div> : null}
    </div>
  )
}
