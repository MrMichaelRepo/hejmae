'use client'

import Link from 'next/link'
import { useState } from 'react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
  }

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

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="text-center mb-10">
            <h1 className="font-serif text-[clamp(1.8rem,3vw,2.4rem)] leading-[1.1] tracking-[-0.015em] mb-3">
              Welcome back
            </h1>
            <p className="font-garamond text-[1rem] leading-relaxed text-hm-nav">
              Sign in to your hejmae studio.
            </p>
          </div>

          {submitted ? (
            <div className="border border-hm-text/15 px-6 py-8 text-center">
              <div className="font-serif text-[1.1rem] mb-3">Check your email</div>
              <p className="font-garamond text-[0.95rem] leading-[1.7] text-hm-nav">
                If an account exists for <span className="text-hm-text">{email}</span>, a sign-in
                link is on its way.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav">
                  Email
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@studio.com"
                  className="bg-transparent border border-hm-text/20 rounded-sm px-4 py-3 font-garamond text-[0.95rem] text-hm-text placeholder:text-hm-nav/60 focus:outline-none focus:border-hm-text/60 transition-colors"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav">
                  Password
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-transparent border border-hm-text/20 rounded-sm px-4 py-3 font-garamond text-[0.95rem] text-hm-text placeholder:text-hm-nav/60 focus:outline-none focus:border-hm-text/60 transition-colors"
                />
              </label>

              <button
                type="submit"
                className="mt-2 font-sans text-[12px] uppercase tracking-[0.22em] bg-hm-text text-bg rounded-full py-3 hover:opacity-90 transition-opacity"
              >
                Sign in
              </button>
            </form>
          )}

          <div className="mt-8 text-center font-garamond text-[0.9rem] text-hm-nav">
            No account yet?{' '}
            <a
              href="mailto:hello@hejmae.com?subject=hejmae%20founder%20access"
              className="text-hm-text underline underline-offset-2 hover:opacity-70 transition-opacity"
            >
              Request access
            </a>
          </div>
        </div>
      </main>

      <footer className="px-8 md:px-12 py-8 text-center">
        <p className="font-sans text-[11px] uppercase tracking-[0.18em] text-hm-nav/60">
          &copy; {new Date().getFullYear()} hejmae
        </p>
      </footer>
    </div>
  )
}
