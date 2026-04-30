'use client'

import Link from 'next/link'
import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
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
          <div className="text-center mb-8">
            <h1 className="font-serif text-[clamp(1.8rem,3vw,2.4rem)] leading-[1.1] tracking-[-0.015em] mb-3">
              Welcome back
            </h1>
            <p className="font-garamond text-[1rem] leading-relaxed text-hm-nav">
              Sign in to your hejmae studio.
            </p>
          </div>

          <SignIn
            routing="path"
            path="/sign-in"
            signUpUrl="/sign-up"
            forceRedirectUrl="/"
            appearance={{
              elements: {
                rootBox: 'w-full',
                card: 'bg-transparent shadow-none border-0 p-0',
                headerTitle: 'hidden',
                headerSubtitle: 'hidden',
                socialButtonsBlockButton:
                  'border border-hm-text/20 rounded-sm hover:bg-hm-text/5',
                formButtonPrimary:
                  'bg-hm-text text-bg rounded-full normal-case font-sans text-[12px] uppercase tracking-[0.2em] hover:opacity-90',
                formFieldInput:
                  'bg-transparent border border-hm-text/20 rounded-sm focus:border-hm-text/60',
                footerAction__signIn: 'font-garamond',
                footer: 'bg-transparent',
              },
            }}
          />
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
