import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  robots: { index: true, follow: true },
}

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="border-b border-line">
        <div className="max-w-3xl mx-auto px-6 md:px-8 py-6 flex items-center justify-between">
          <Link
            href="/"
            className="font-sans text-[13px] font-bold uppercase tracking-[0.22em] text-ink"
          >
            hejmae
          </Link>
          <Link
            href="/"
            className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted hover:text-ink transition-colors"
          >
            ← Home
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 md:px-8 py-14 md:py-20">
        {children}
      </main>
      <footer className="border-t border-line">
        <div className="max-w-3xl mx-auto px-6 md:px-8 py-6 flex items-center justify-between font-sans text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
          <span>Hejmae</span>
          <Link href="/legal/privacy" className="hover:text-ink-muted transition-colors">
            Privacy
          </Link>
        </div>
      </footer>
    </div>
  )
}
