// Shared 4-up tile grid used on Bookkeeping Overview and report pages.
// Keeps the look consistent and the markup short.

export function StatGrid({ children, cols = 4 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  const colClass =
    cols === 2 ? 'grid-cols-2' : cols === 3 ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-2 md:grid-cols-4'
  return (
    <div
      className={`grid ${colClass} gap-px mb-10`}
      style={{ background: 'rgba(30,33,40,0.1)' }}
    >
      {children}
    </div>
  )
}

export function StatTile({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  emphasis?: boolean
}) {
  return (
    <div className={['bg-bg p-6', emphasis ? '' : ''].join(' ')}>
      <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-2">
        {label}
      </div>
      <div
        className={[
          'font-serif leading-none',
          emphasis ? 'text-[2rem]' : 'text-[1.6rem]',
        ].join(' ')}
      >
        {value}
      </div>
      {sub ? (
        <div className="mt-2 font-garamond text-[0.85rem] text-hm-nav/80">
          {sub}
        </div>
      ) : null}
    </div>
  )
}
