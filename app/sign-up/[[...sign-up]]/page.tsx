'use client'

import Link from 'next/link'
import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
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
        <div className="text-center mb-10 max-w-sm">
          <h1 className="font-serif text-[clamp(1.8rem,3vw,2.4rem)] leading-[1.1] tracking-[-0.015em] mb-3">
            Create your studio
          </h1>
          <p className="font-garamond text-[1rem] leading-relaxed text-hm-nav">
            Get started with hejmae.
          </p>
        </div>

        <SignUp
          routing="path"
          path="/sign-up"
          signInUrl="/sign-in"
          forceRedirectUrl="/"
        />
      </main>

      <footer className="px-8 md:px-12 py-8 text-center">
        <p className="font-sans text-[11px] uppercase tracking-[0.18em] text-hm-nav/60">
          &copy; {new Date().getFullYear()} hejmae
        </p>
      </footer>
    </div>
  )
}
