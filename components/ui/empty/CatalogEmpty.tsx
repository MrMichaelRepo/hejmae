'use client'

import Link from 'next/link'
import Button from '@/components/ui/Button'

/**
 * First-run empty state for /dashboard/catalog. The catalog auto-populates
 * from clippings, so this state should point users at the clipper.
 */
export default function CatalogEmpty() {
  return (
    <div className="border border-line rounded-lg bg-bg-elevated/40 p-12 text-center max-w-2xl mx-auto">
      <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-subtle mb-3">
        Studio library
      </div>
      <h2 className="font-serif text-[1.7rem] leading-[1.15] tracking-[-0.01em] mb-3">
        Your catalog builds itself.
      </h2>
      <p className="font-garamond text-[1.02rem] leading-[1.65] text-ink-muted mb-6 max-w-md mx-auto">
        Every product you clip is deduped against everyone else's clippings
        — the second time you (or anyone) saves the same SKU it's instant.
        Start clipping and the library will fill in.
      </p>
      <Link href="/dashboard/clippings">
        <Button variant="primary">Go to clippings</Button>
      </Link>
    </div>
  )
}
