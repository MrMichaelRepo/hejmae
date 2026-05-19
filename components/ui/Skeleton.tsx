'use client'

/**
 * Skeleton primitive — replaces spinners on initial fetch. Match the final
 * layout dimensions so the page doesn't jump when real data lands.
 */
export function Skeleton({
  className = '',
  width,
  height,
}: {
  className?: string
  width?: number | string
  height?: number | string
}) {
  const style: React.CSSProperties = {}
  if (width != null) style.width = typeof width === 'number' ? `${width}px` : width
  if (height != null) style.height = typeof height === 'number' ? `${height}px` : height
  return (
    <div
      aria-hidden
      style={style}
      className={['bg-line/60 rounded animate-pulse', className].join(' ')}
    />
  )
}

/** Row used in list-style pages (Projects, Clients, Vendors, POs). */
export function SkeletonRow({ density = 'comfortable' as const }: { density?: 'compact' | 'comfortable' | 'spacious' }) {
  const py = density === 'compact' ? 'py-2' : density === 'spacious' ? 'py-5' : 'py-4'
  return (
    <div className={['grid grid-cols-[1fr_auto_auto] gap-6 items-center px-5 border-t border-line first:border-t-0', py].join(' ')}>
      <div className="space-y-2">
        <Skeleton height={18} width="40%" />
        <Skeleton height={12} width="25%" className="opacity-70" />
      </div>
      <Skeleton height={14} width={80} />
      <Skeleton height={20} width={70} className="rounded-sm" />
    </div>
  )
}

export function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <div className="border border-line rounded">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  )
}

/** Card used in the clippings / catalog grids. */
export function SkeletonCard() {
  return (
    <div className="border border-line rounded bg-bg-elevated/40 overflow-hidden">
      <Skeleton className="aspect-square rounded-none" />
      <div className="p-4 space-y-2">
        <Skeleton height={16} width="80%" />
        <Skeleton height={12} width="50%" className="opacity-70" />
        <Skeleton height={12} width="35%" className="opacity-70" />
      </div>
    </div>
  )
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
