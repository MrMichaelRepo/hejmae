import Link from 'next/link'
import type { ReactNode } from 'react'

export const authStyles = {
  input:
    'w-full bg-transparent border-b border-hm-text/20 px-0 py-2 font-garamond text-[1rem] text-hm-text placeholder:text-hm-nav/50 focus:outline-none focus:border-hm-text/40 transition-colors data-[invalid=true]:border-red-700',
  label: 'font-sans text-[11px] uppercase tracking-[0.18em] text-hm-nav',
  primaryButton:
    'w-full bg-hm-text text-bg font-sans text-[12px] uppercase tracking-[0.18em] py-4 hover:bg-hm-text/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
  ghostButton:
    'w-full border border-hm-text/25 bg-transparent text-hm-text font-sans text-[12px] uppercase tracking-[0.18em] py-4 hover:border-hm-text hover:bg-hm-text/[0.03] transition-colors flex items-center justify-center gap-3 disabled:opacity-50',
  fieldError: 'block font-garamond text-[0.875rem] text-red-700 mt-2',
  globalError:
    'block font-garamond text-[0.875rem] text-red-700 text-center mb-6',
  textLink:
    'font-sans text-[11px] uppercase tracking-[0.18em] text-hm-nav hover:text-hm-text transition-colors',
} as const

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-8 md:px-12 py-6 flex items-center justify-between">
        <Link
          href="/"
          className="font-sans text-[13px] font-bold uppercase tracking-[0.22em] text-hm-text"
        >
          hejmae
        </Link>
        <Link
          href="/"
          className="font-sans text-[12px] uppercase tracking-[0.18em] text-hm-nav hover:text-hm-text transition-colors"
        >
          Back to site
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {children}
      </main>

      <footer className="px-8 md:px-12 py-8 text-center">
        <p className="font-sans text-[11px] uppercase tracking-[0.18em] text-hm-nav/60">
          &copy; {new Date().getFullYear()} hejmae
        </p>
      </footer>
    </div>
  )
}

export function AuthHeading({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string
}) {
  return (
    <div className="text-center mb-10">
      <h1 className="font-serif text-[clamp(1.8rem,3vw,2.4rem)] leading-[1.1] tracking-[-0.015em] mb-3">
        {title}
      </h1>
      {subtitle ? (
        <p className="font-garamond text-[1rem] leading-relaxed text-hm-nav">
          {subtitle}
        </p>
      ) : null}
    </div>
  )
}

export function OrDivider() {
  return (
    <div className="my-7 flex items-center gap-4">
      <span className="flex-1 h-px bg-hm-text/15" />
      <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav/70">
        or
      </span>
      <span className="flex-1 h-px bg-hm-text/15" />
    </div>
  )
}

export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}
