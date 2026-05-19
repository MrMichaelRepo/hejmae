'use client'

import Button from '@/components/ui/Button'

const EXTENSION_URL =
  process.env.NEXT_PUBLIC_CLIPPER_URL ??
  'https://chromewebstore.google.com/'

/**
 * First-run empty state for /dashboard/clippings.
 *
 * The clipper lives in the browser, so we lead with the install CTA and
 * preview what a real clipping card looks like once the user starts saving
 * products. See [[project-clipper-overview]] in memory for the extension
 * boundary.
 */
export default function ClippingsEmpty() {
  return (
    <div className="grid md:grid-cols-[1.05fr_1fr] gap-8 items-center border border-line rounded-lg bg-bg-elevated/40 p-10">
      <div>
        <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-subtle mb-3">
          Sourcing
        </div>
        <h2 className="font-serif text-[1.7rem] leading-[1.15] tracking-[-0.01em] mb-3">
          Clip products as you browse.
        </h2>
        <p className="font-garamond text-[1.02rem] leading-[1.65] text-ink-muted mb-6 max-w-md">
          Install the Hejmae Clipper — a one-click browser extension that
          captures any product page (name, brand, price, image) and saves it
          here. From here you can attach a clipping to a project room with
          one click, or batch-select to specify a whole moodboard at once.
        </p>
        <div className="flex items-center gap-3">
          <a href={EXTENSION_URL} target="_blank" rel="noreferrer">
            <Button variant="primary">Install the clipper</Button>
          </a>
          <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
            Chrome · Edge · Brave
          </span>
        </div>
      </div>

      {/* Sample clipping card */}
      <div className="border border-line rounded bg-surface overflow-hidden max-w-sm mx-auto w-full">
        <div className="aspect-square bg-accent-soft/40 flex items-center justify-center">
          <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-accent">
            Sample · product image
          </span>
        </div>
        <div className="p-4">
          <div className="font-serif text-[1.05rem] leading-tight">
            Camp Pendant
          </div>
          <div className="font-garamond text-[0.85rem] text-ink-muted mt-0.5">
            Cedar &amp; Moss
          </div>
          <div className="flex items-baseline justify-between mt-3">
            <span className="font-garamond text-[1rem] num text-ink">
              $682.00
            </span>
            <span className="font-sans text-[9px] uppercase tracking-[0.18em] text-ink-subtle">
              Clipped 2d ago
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
