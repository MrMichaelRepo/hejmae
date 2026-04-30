'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { UserButton, useAuth } from '@clerk/nextjs'

const NAV_SECTIONS: Array<[string, string]> = [
  ['About', 'about'],
  ['Features', 'features'],
  ['Pricing', 'pricing'],
  ['FAQ', 'faq'],
  ['Privacy', 'privacy'],
]

export default function HomePage() {
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
            className="font-sans text-[13px] font-bold uppercase tracking-[0.22em] text-hm-text bg-transparent border-0 cursor-pointer"
          >
            hejmae
          </button>

          <nav className="hidden md:flex items-center gap-9">
            {NAV_SECTIONS.map(([label, id]) => (
              <button
                key={id}
                onClick={() => smoothScrollTo(id)}
                className="nav-item underline-animated bg-transparent border-0 cursor-pointer font-sans text-[12px] uppercase tracking-[0.18em] text-hm-nav"
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-6">
            <a
              href="mailto:hello@hejmae.com"
              className="hidden sm:inline font-sans text-[12px] uppercase tracking-[0.18em] text-hm-nav hover:text-hm-text transition-colors"
            >
              Contact
            </a>
            {isLoaded && (
              isSignedIn ? (
                <>
                  <Link
                    href="/dashboard"
                    className="inline-block font-sans text-[11px] uppercase tracking-[0.2em] border border-hm-text/25 rounded-full px-5 py-2 text-hm-text hover:bg-hm-text hover:text-bg transition-all duration-300"
                  >
                    Dashboard
                  </Link>
                  <UserButton />
                </>
              ) : (
                <Link
                  href="/sign-in"
                  className="inline-block font-sans text-[11px] uppercase tracking-[0.2em] border border-hm-text/25 rounded-full px-5 py-2 text-hm-text hover:bg-hm-text hover:text-bg transition-all duration-300"
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
          hejmae
        </h1>
        <p
          className="mt-6 max-w-md font-garamond text-[clamp(1rem,2vw,1.2rem)] leading-relaxed text-hm-nav opacity-0 animate-fade-up"
          style={{ animationDelay: '0.6s', animationFillMode: 'forwards' }}
        >
          Project management, bookkeeping, and purchase tracking
          — designed for interior designers.
        </p>
        <div
          className="mt-10 opacity-0 animate-fade-up"
          style={{ animationDelay: '0.9s', animationFillMode: 'forwards' }}
        >
          <a
            href="mailto:hello@hejmae.com"
            className="inline-block font-sans text-[12px] uppercase tracking-[0.2em] border border-hm-text/20 rounded-full px-8 py-3 text-hm-text hover:bg-hm-text hover:text-bg transition-all duration-300"
          >
            Get in touch
          </a>
        </div>
      </section>

      {/* ── ABOUT ─────────────────────────────────────────────────────────── */}
      <section id="about" className="px-6 md:px-12 py-28 md:py-36" style={{ scrollMarginTop: 80 }}>
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-end">
          <div className="reveal">
            <div className="font-sans text-[10px] uppercase tracking-[0.26em] text-hm-nav mb-4">
              About
            </div>
            <h2 className="font-serif text-[clamp(1.8rem,3.2vw,2.8rem)] leading-[1.12] tracking-[-0.015em]">
              Software made for the way<br />
              <em className="italic">interior designers actually work.</em>
            </h2>
          </div>
          <p className="reveal reveal-d1 font-garamond text-[1.05rem] leading-[1.85] text-hm-nav">
            hejmae brings together the tools studios already juggle — project plans, supplier
            invoices, client billing, and purchase orders — into one calm workspace. Built by
            people who have spent years inside studios, for the people who keep them running.
          </p>
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────────────────────── */}
      <section
        id="features"
        className="px-6 md:px-12 py-28 md:py-36"
        style={{ scrollMarginTop: 80, background: '#e2dfd5' }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-end mb-16">
            <div className="reveal">
              <div className="font-sans text-[10px] uppercase tracking-[0.26em] text-hm-nav mb-4">
                Features
              </div>
              <h2 className="font-serif text-[clamp(1.8rem,3.2vw,2.8rem)] leading-[1.12] tracking-[-0.015em]">
                Everything a studio needs.<br />
                <em className="italic">Nothing it doesn&apos;t.</em>
              </h2>
            </div>
            <p className="reveal reveal-d1 font-garamond text-[1.05rem] leading-[1.85] text-hm-nav">
              Three modules that talk to each other from day one. No spreadsheets stitched to
              project files, no purchase orders living in email — one source of truth for the
              whole studio.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-px" style={{ background: 'rgba(30,33,40,0.1)' }}>
            {[
              {
                title: 'Project Management',
                text: 'Phase-based timelines, deliverables, and client approvals. Designed around the way studios actually scope and bill.',
              },
              {
                title: 'Bookkeeping',
                text: 'Studio-aware double-entry that understands retainers, deposits, and reimbursable expenses. Export-ready for your accountant.',
              },
              {
                title: 'Purchase Tracking',
                text: 'Specifications, POs, and shipping status linked back to the project and the client invoice. No more chasing vendors by email.',
              },
            ].map(({ title, text }) => (
              <div key={title} className="reveal bg-bg p-9">
                <div className="font-serif text-[1.15rem] mb-3 leading-tight">{title}</div>
                <div className="font-garamond text-[0.95rem] leading-[1.8] text-hm-nav">{text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────────────────────────── */}
      <section id="pricing" className="px-6 md:px-12 py-28 md:py-36" style={{ scrollMarginTop: 80 }}>
        <div className="max-w-6xl mx-auto text-center">
          <div className="reveal">
            <div className="font-sans text-[10px] uppercase tracking-[0.26em] text-hm-nav mb-4">
              Pricing
            </div>
            <h2 className="font-serif text-[clamp(1.8rem,3.2vw,2.8rem)] leading-[1.12] tracking-[-0.015em] mb-6">
              One plan. Per studio.
            </h2>
            <p className="font-garamond text-[1.05rem] leading-[1.85] text-hm-nav max-w-xl mx-auto">
              hejmae is in private beta. Pricing will be announced ahead of public launch — early
              studios get founder pricing for life.
            </p>
          </div>

          <div className="reveal reveal-d1 mt-14 inline-block border border-hm-text/15 px-12 py-10">
            <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-3">
              Founder Access
            </div>
            <div className="font-serif text-[2rem] mb-2">By invitation</div>
            <div className="font-garamond text-[0.95rem] text-hm-nav mb-6">
              Unlimited projects, users, and purchase orders.
            </div>
            <a
              href="mailto:hello@hejmae.com?subject=hejmae%20founder%20access"
              className="inline-block font-sans text-[12px] uppercase tracking-[0.2em] border border-hm-text/20 rounded-full px-7 py-3 text-hm-text hover:bg-hm-text hover:text-bg transition-all duration-300"
            >
              Request access
            </a>
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <section
        id="faq"
        className="px-6 md:px-12 py-28 md:py-36"
        style={{ scrollMarginTop: 80, background: '#e2dfd5' }}
      >
        <div className="max-w-6xl mx-auto grid md:grid-cols-[280px_1fr] gap-16">
          <div className="reveal pt-1">
            <div className="font-sans text-[10px] uppercase tracking-[0.26em] text-hm-nav mb-4">
              FAQ
            </div>
            <h2 className="font-serif text-[clamp(1.6rem,2.6vw,2.4rem)] leading-[1.15]">
              Common questions
            </h2>
          </div>
          <div>
            {[
              {
                q: 'Who is hejmae for?',
                a: 'Independent and boutique interior design studios — typically 1–20 people — that have outgrown spreadsheets and generic project tools but do not want to bolt together five separate SaaS products.',
              },
              {
                q: 'Can I migrate from my current tools?',
                a: 'Yes. We help every founder-cohort studio import projects, contacts, and historical purchase orders from spreadsheets, QuickBooks, or your existing project tool during onboarding.',
              },
              {
                q: 'Does hejmae replace my accountant?',
                a: 'No. hejmae handles studio bookkeeping in the format your accountant expects — clean exports, traceable transactions, and reimbursable expenses tagged by project.',
              },
              {
                q: 'Is hejmae available outside Europe?',
                a: 'Yes. hejmae works for studios anywhere, with multi-currency support and locale-aware tax handling. Our data is hosted in the EU.',
              },
              {
                q: 'When can I sign up?',
                a: 'We are onboarding founder studios through 2026. Email us and we will let you know when your region opens up.',
              },
            ].map(({ q, a }) => (
              <div key={q} className="reveal py-6 border-b border-hm-text/10">
                <div className="font-serif text-[1.05rem] mb-2 leading-snug">{q}</div>
                <div className="font-garamond text-[0.95rem] leading-[1.85] text-hm-nav">{a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRIVACY ───────────────────────────────────────────────────────── */}
      <section id="privacy" className="px-6 md:px-12 py-28 md:py-36" style={{ scrollMarginTop: 80 }}>
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-start">
          <div className="reveal">
            <div className="font-sans text-[10px] uppercase tracking-[0.26em] text-hm-nav mb-4">
              Privacy
            </div>
            <h2 className="font-serif text-[clamp(1.8rem,3.2vw,2.8rem)] leading-[1.12] tracking-[-0.015em] mb-6">
              Your studio&apos;s data,<br />
              <em className="italic">on your terms.</em>
            </h2>
            <p className="font-garamond text-[1.05rem] leading-[1.85] text-hm-nav mb-5">
              hejmae stores studio data on EU servers and collects only what is necessary to run
              your account. We never sell, share, or train on your information.
            </p>
            <p className="font-garamond text-[1.05rem] leading-[1.85] text-hm-nav">
              You can export your full studio dataset — projects, ledgers, purchase orders — at
              any time, and permanently delete your account from settings.
            </p>
          </div>

          <div className="reveal reveal-d1 grid sm:grid-cols-2 gap-px" style={{ background: 'rgba(30,33,40,0.1)' }}>
            {[
              { title: 'EU-Hosted', text: 'All studio data stored on European servers under GDPR.' },
              { title: 'No Tracking', text: 'No advertising cookies. Cookieless analytics only.' },
              { title: 'Data Portability', text: 'Export your full dataset whenever you want.' },
              { title: 'Right to Delete', text: 'Permanent account and data deletion in one click.' },
            ].map(({ title, text }) => (
              <div key={title} className="bg-bg p-7">
                <div className="font-serif text-[1rem] mb-2">{title}</div>
                <div className="font-garamond text-[0.9rem] leading-[1.8] text-hm-nav">{text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer className="px-8 md:px-12 py-10 text-center border-t border-hm-text/10">
        <p className="font-sans text-[11px] uppercase tracking-[0.18em] text-hm-nav/60">
          &copy; {new Date().getFullYear()} hejmae
        </p>
      </footer>
    </div>
  )
}
