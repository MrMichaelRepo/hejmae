'use client'

import Link from 'next/link'
import * as Clerk from '@clerk/elements/common'
import * as SignUp from '@clerk/elements/sign-up'
import {
  AuthHeading,
  AuthShell,
  GoogleIcon,
  OrDivider,
  authStyles as s,
} from '@/components/auth'

export default function SignUpPage() {
  return (
    <AuthShell>
      <SignUp.Root path="/sign-up">
        <SignUp.Step name="start" className="w-full max-w-sm">
          <AuthHeading
            title="Create your studio"
            subtitle="Get started with hejmae."
          />

          <Clerk.GlobalError className={s.globalError} />

          <Clerk.Connection name="google" asChild>
            <button type="button" className={s.ghostButton}>
              <GoogleIcon />
              <span>Continue with Google</span>
            </button>
          </Clerk.Connection>

          <OrDivider />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
            <Clerk.Field name="firstName" className="block">
              <Clerk.Label className={s.label}>First name</Clerk.Label>
              <Clerk.Input
                type="text"
                autoFocus
                autoComplete="given-name"
                className={s.input}
              />
              <Clerk.FieldError className={s.fieldError} />
            </Clerk.Field>
            <Clerk.Field name="lastName" className="block">
              <Clerk.Label className={s.label}>Last name</Clerk.Label>
              <Clerk.Input
                type="text"
                autoComplete="family-name"
                className={s.input}
              />
              <Clerk.FieldError className={s.fieldError} />
            </Clerk.Field>
          </div>

          <Clerk.Field name="emailAddress" className="block mb-5">
            <Clerk.Label className={s.label}>Email</Clerk.Label>
            <Clerk.Input
              type="email"
              required
              autoComplete="email"
              className={s.input}
            />
            <Clerk.FieldError className={s.fieldError} />
          </Clerk.Field>

          <Clerk.Field name="password" className="block mb-6">
            <Clerk.Label className={s.label}>Password</Clerk.Label>
            <Clerk.Input
              type="password"
              required
              autoComplete="new-password"
              className={s.input}
            />
            <Clerk.FieldError className={s.fieldError} />
          </Clerk.Field>

          <SignUp.Captcha className="empty:hidden mb-6" />

          <SignUp.Action submit asChild>
            <button type="submit" className={s.primaryButton}>
              Create account
            </button>
          </SignUp.Action>

          <p className="mt-8 text-center font-garamond text-[0.95rem] text-hm-nav">
            Already have an account?{' '}
            <Link
              href="/sign-in"
              className="text-hm-text underline underline-offset-4 hover:no-underline"
            >
              Sign in
            </Link>
          </p>
        </SignUp.Step>

        <SignUp.Step name="continue" className="w-full max-w-sm">
          <AuthHeading
            title="A few more details"
            subtitle="Just one more step."
          />

          <Clerk.GlobalError className={s.globalError} />

          <Clerk.Field name="username" className="block mb-6">
            <Clerk.Label className={s.label}>Username</Clerk.Label>
            <Clerk.Input
              type="text"
              autoFocus
              autoComplete="username"
              className={s.input}
            />
            <Clerk.FieldError className={s.fieldError} />
          </Clerk.Field>

          <SignUp.Action submit asChild>
            <button type="submit" className={s.primaryButton}>
              Continue
            </button>
          </SignUp.Action>
        </SignUp.Step>

        <SignUp.Step name="verifications" className="w-full max-w-sm">
          <SignUp.Strategy name="email_code">
            <AuthHeading
              title="Check your email"
              subtitle="We sent a verification code to your inbox."
            />

            <Clerk.GlobalError className={s.globalError} />

            <Clerk.Field name="code" className="block mb-8">
              <Clerk.Label className={s.label}>Verification code</Clerk.Label>
              <Clerk.Input
                type="otp"
                required
                autoFocus
                className={s.input}
              />
              <Clerk.FieldError className={s.fieldError} />
            </Clerk.Field>

            <SignUp.Action submit asChild>
              <button type="submit" className={s.primaryButton}>
                Verify
              </button>
            </SignUp.Action>

            <SignUp.Action
              resend
              className={`${s.textLink} block w-full mt-6 text-center disabled:text-hm-nav/40 disabled:hover:text-hm-nav/40`}
              fallback={({ resendableAfter }) => (
                <span className="block w-full mt-6 text-center font-sans text-[11px] uppercase tracking-[0.18em] text-hm-nav/40">
                  Resend in {resendableAfter}s
                </span>
              )}
            >
              Resend code
            </SignUp.Action>
          </SignUp.Strategy>
        </SignUp.Step>
      </SignUp.Root>
    </AuthShell>
  )
}
