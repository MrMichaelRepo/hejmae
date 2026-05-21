'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ClerkProvider, UserButton, useAuth } from '@clerk/nextjs'
import { clerkAppearance } from '@/lib/clerkAppearance'

const NAV_SECTIONS: Array<[string, string]> = [
  ['About', 'about'],
  ['Features', 'features'],
  ['Pricing', 'pricing'],
  ['FAQ', 'faq'],
  ['Privacy', 'privacy'],
]

export default function HomePageClient() {
  return (
    <ClerkProvider afterSignOutUrl="/" appearance={clerkAppearance}>
      <HomePageContent />
    </ClerkProvider>
  )
}

function HomePageContent() {
  const { isSignedIn, isLoaded } = useAuth()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  useEffect(() => {
    const els = document.querySelectorAll('.reveal')
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible') }),
      { threshold: 0.08 }
    )
    els.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  const smoothScrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    const target = el.getBoundingClientRect().top + window.scrollY - 80
    const start = window.scrollY
    const distance = target - start
    const duration = 800
    let startTime: number | null = null
    const step = (ts: number) => {
      if (startTime === null) startTime = ts
      const p = Math.min((ts - startTime) / duration, 1)
      const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
      window.scrollTo(0, start + distance * ease)
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  return (
    <div className="min-h-screen">
      {/* ── NAV ───────────────────────────────────────────────────────────── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          background: scrolled ? 'rgba(234,232,224,0.92)' : 'transparent',
          backdropFilter: scrolled ? 'blur(10px)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(30,33,40,0.08)' : '1px solid transparent',
        }}
      >
        <div className="max-w-6xl mx-auto px-8 md:px-12 h-[68px] flex items-center justify-between">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="font-sans text-[13px] font-bold uppercase tracking-[0.22em] text-ink bg-transparent border-0 cursor-pointer"
          >
            hejmae
          </button>

          <nav className="hidden md:flex items-center gap-9">
            {NAV_SECTIONS.map(([label, id]) => (
              <button
                key={id}
                onClick={() => smoothScrollTo(id)}
                className="nav-item underline-animated bg-transparent border-0 cursor-pointer font-sans text-[12px] uppercase tracking-[0.18em] text-ink-muted"
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-6">
            <a
              href="mailto:hello@hejmae.com"
              className="hidden sm:inline font-sans text-[12px] uppercase tracking-[0.18em] text-ink-muted hover:text-ink transition-colors"
            >
              Contact
            </a>
            {isLoaded && (
              isSignedIn ? (
                <>
                  <Link
                    href="/dashboard"
                    className="inline-block font-sans text-[11px] uppercase tracking-[0.2em] border border-line-strong rounded-full px-5 py-2 text-ink hover:bg-ink hover:text-bg transition-all duration-300"
                  >
                    Dashboard
                  </Link>
                  <UserButton afterSignOutUrl="/" showName={false}>
                    <UserButton.MenuItems>
                      <UserButton.Link
                        label="Studio settings"
                        labelIcon={
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                          </svg>
                        }
                        href="/dashboard/settings"
                      />
                      <UserButton.Action label="signOut" />
                    </UserButton.MenuItems>
                  </UserButton>
                </>
              ) : (
                <Link
                  href="/sign-in"
                  className="inline-block font-sans text-[11px] uppercase tracking-[0.2em] border border-line-strong rounded-full px-5 py-2 text-ink hover:bg-ink hover:text-bg transition-all duration-300"
                >
                  Login
                </Link>
              )
            )}
          </div>
        </div>
      </header>

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <h1
          className="font-serif text-[clamp(2.4rem,6vw,5rem)] font-normal leading-[1.05] tracking-[-0.01em] opacity-0 animate-fade-up"
          style={{ animationDelay: '0.3s', animationFillMode: 'forwards' }}
        >
          Coming Soon
        </h1>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer className="px-8 md:px-12 py-10 text-center border-t border-line">
        <p className="font-sans text-[11px] uppercase tracking-[0.18em] text-ink-subtle">
          &copy; {new Date().getFullYear()} hejmae
        </p>
      </footer>
    </div>
  )
}
