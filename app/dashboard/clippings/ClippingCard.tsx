'use client'

import Image from 'next/image'
import { formatCents } from '@/lib/format'
import type { ClippingItemFeedRow } from '@/lib/types-ui'

interface Props {
  row: ClippingItemFeedRow
  canDelete: boolean
  onDelete: () => void
  onAddToProject: () => void
  weekLabel: string
  // Bulk-select mode: when true, the card swallows its image/title
  // links and clicking anywhere on the card toggles selection. The
  // per-card "Add to project" + delete actions are hidden so the only
  // affordance is selection.
  selectMode?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}

export default function ClippingCard({
  row,
  canDelete,
  onDelete,
  onAddToProject,
  weekLabel,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: Props) {
  const isPending = row.scrape_status === 'pending'
  const isFailed = row.scrape_status === 'failed'
  const sourceHost = safeHost(row.source_url)

  return (
    <article
      className={[
        'group border bg-bg flex flex-col transition-colors relative',
        selectMode && selected
          ? 'border-hm-text ring-1 ring-hm-text'
          : 'border-hm-text/10',
      ].join(' ')}
    >
      {/* Select-mode overlay — captures clicks across the whole card so
          the underlying image / title links can't fire. Sits above
          everything except the explicit selection checkmark. */}
      {selectMode ? (
        <button
          type="button"
          onClick={onToggleSelect}
          aria-pressed={selected}
          aria-label={selected ? 'Deselect clipping' : 'Select clipping'}
          className="absolute inset-0 z-20 cursor-pointer bg-transparent border-0"
        />
      ) : null}

      {selectMode ? (
        <div
          aria-hidden
          className={[
            'absolute top-2.5 right-2.5 z-30 inline-flex items-center justify-center w-6 h-6 rounded-full border transition-colors',
            selected
              ? 'bg-hm-text border-hm-text text-bg'
              : 'bg-bg/90 backdrop-blur border-hm-text/30 text-transparent',
          ].join(' ')}
        >
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M5 12l5 5 9-11" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      ) : null}

      {/* Image */}
      <a
        href={row.source_url}
        target="_blank"
        rel="noreferrer noopener"
        className="relative block aspect-[4/3] bg-hm-text/[0.05] overflow-hidden"
      >
        {row.image_url && !isFailed ? (
          <Image
            src={row.image_url}
            alt={row.name ?? ''}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform group-hover:scale-[1.02]"
            unoptimized
          />
        ) : (
          <BrokenImagePlaceholder />
        )}

        {isPending ? <ShimmerOverlay /> : null}

        {/* Clipper chip */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-bg/90 backdrop-blur px-2 py-1 rounded-full">
          <ClipperAvatar
            name={row.clipper.name ?? row.clipper.email}
            logoUrl={row.clipper.logo_url}
          />
          <span className="font-sans text-[9px] uppercase tracking-[0.18em] text-hm-text max-w-[120px] truncate">
            {row.clipper.name?.trim() || row.clipper.email}
          </span>
        </div>
      </a>

      {/* Body */}
      <div className="flex flex-col gap-2 px-4 py-3.5 flex-1">
        <a
          href={row.source_url}
          target="_blank"
          rel="noreferrer noopener"
          className="font-serif text-[1.05rem] leading-tight line-clamp-2 hover:underline"
        >
          {row.name?.trim() ||
            (isPending ? 'Loading product…' : sourceHost ?? row.source_url)}
        </a>

        <div className="font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav truncate">
          {row.brand?.trim() || sourceHost || '—'}
        </div>

        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          {row.retail_price_cents != null ? (
            <span className="font-garamond text-[0.95rem] text-hm-text">
              {formatCents(row.retail_price_cents)}
            </span>
          ) : null}
          {row.project ? (
            <span className="font-sans text-[9px] uppercase tracking-[0.18em] text-hm-text border border-hm-text/20 px-2 py-0.5">
              {row.project.name}
            </span>
          ) : null}
          <span className="font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav ml-auto">
            {weekLabel}
          </span>
        </div>

        {/* Actions — hidden in bulk select mode so the only affordance
            is the selection click target. */}
        {selectMode ? null : (
          <div className="mt-3 pt-3 border-t border-hm-text/10 flex items-center justify-between gap-2">
            <button
              onClick={onAddToProject}
              disabled={isPending}
              className="font-sans text-[10px] uppercase tracking-[0.22em] bg-hm-text text-bg px-4 py-2 rounded-full hover:bg-hm-text/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add to project
            </button>
            {canDelete ? (
              <button
                onClick={onDelete}
                aria-label="Delete clipping"
                className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav hover:text-red-700 px-3 py-2"
              >
                ✕
              </button>
            ) : null}
          </div>
        )}
      </div>
    </article>
  )
}

function ShimmerOverlay() {
  return (
    <div
      className="absolute inset-0 bg-gradient-to-r from-hm-text/[0.04] via-hm-text/[0.10] to-hm-text/[0.04] animate-pulse"
      aria-label="Loading product details"
    />
  )
}

function BrokenImagePlaceholder() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-hm-text/[0.05]">
      <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav">
        Preview unavailable
      </span>
    </div>
  )
}

function ClipperAvatar({
  name,
  logoUrl,
}: {
  name: string
  logoUrl: string | null
}) {
  if (logoUrl) {
    return (
      <span className="relative w-5 h-5 rounded-full overflow-hidden bg-hm-text/[0.05]">
        <Image src={logoUrl} alt="" fill sizes="20px" unoptimized />
      </span>
    )
  }
  const initial = (name.trim()[0] ?? '?').toUpperCase()
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-hm-text text-bg font-sans text-[9px]">
      {initial}
    </span>
  )
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}
