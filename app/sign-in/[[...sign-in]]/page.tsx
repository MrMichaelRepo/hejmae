'use client'

import Link from 'next/link'
import * as Clerk from '@clerk/elements/common'
import * as SignIn from '@clerk/elements/sign-in'
import {
  AuthHeading,
  AuthShell,
  GoogleIcon,
  OrDivider,
  authStyles as s,
} from '@/components/auth'

export default function SignInPage() {
  return (
    <AuthShell>
      <SignIn.Root path="/sign-in">
        <SignIn.Step name="start" className="w-full max-w-sm">
          <AuthHeading
            title="Welcome back"
            subtitle="Sign in to your hejmae studio."
          />

          <Clerk.GlobalError className={s.globalError} />

          <Clerk.Connection name="google" asChild>
            <button type="button" className={s.ghostButton}>
              <GoogleIcon />
              <span>Continue with Google</span>
            </button>
          </Clerk.Connection>

          <OrDivider />

          <Clerk.Field name="identifier" className="block mb-5">
            <Clerk.Label className={s.label}>Email</Clerk.Label>
            <Clerk.Input
              type="email"
              required
              autoFocus
              autoComplete="email"
              className={s.input}
            />
            <Clerk.FieldError className={s.fieldError} />
          </Clerk.Field>

          <Clerk.Field name="password" className="block mb-6">
            <div className="flex items-baseline justify-between mb-1">
              <Clerk.Label className={s.label}>Password</Clerk.Label>
              <SignIn.Action
                navigate="forgot-password"
                className={s.textLink}
              >
                Forgot?
              </SignIn.Action>
            </div>
            <Clerk.Input
              type="password"
              required
              autoComplete="current-password"
              className={s.input}
            />
            <Clerk.FieldError className={s.fieldError} />
          </Clerk.Field>

          <SignIn.Action submit asChild>
            <button type="submit" className={s.primaryButton}>
              Sign in
            </button>
          </SignIn.Action>

          <p className="mt-8 text-center font-garamond text-[0.95rem] text-hm-nav">
            No account yet?{' '}
            <Link
              href="/sign-up"
              className="text-hm-text underline underline-offset-4 hover:no-underline"
            >
              Create your studio
            </Link>
          </p>
        </SignIn.Step>

        <SignIn.Step name="verifications" className="w-full max-w-sm">
          <SignIn.Strategy name="reset_password_email_code">
            <AuthHeading
              title="Check your email"
              subtitle="We sent a verification code to your inbox."
            />

            <Clerk.GlobalError className={s.globalError} />

            <Clerk.Field name="code" className="block mb-6">
              <Clerk.Label className={s.label}>Verification code</Clerk.Label>
              <Clerk.Input
                type="otp"
                required
                autoFocus
                className={s.input}
              />
              <Clerk.FieldError className={s.fieldError} />
            </Clerk.Field>

            <SignIn.Action submit asChild>
              <button type="submit" className={s.primaryButton}>
                Continue
              </button>
            </SignIn.Action>
          </SignIn.Strategy>
        </SignIn.Step>

        <SignIn.Step name="forgot-password" className="w-full max-w-sm">
          <AuthHeading
            title="Reset your password"
            subtitle="We&rsquo;ll send a verification code to your email."
          />

          <Clerk.GlobalError className={s.globalError} />

          <SignIn.SupportedStrategy name="reset_password_email_code" asChild>
            <button type="button" className={s.primaryButton}>
              Send reset code
            </button>
          </SignIn.SupportedStrategy>

          <SignIn.Action
            navigate="previous"
            className={`${s.textLink} block w-full mt-6 text-center`}
          >
            Back
          </SignIn.Action>
        </SignIn.Step>

        <SignIn.Step name="reset-password" className="w-full max-w-sm">
          <AuthHeading title="Choose a new password" />

          <Clerk.GlobalError className={s.globalError} />

          <Clerk.Field name="password" className="block mb-5">
            <Clerk.Label className={s.label}>New password</Clerk.Label>
            <Clerk.Input
              type="password"
              required
              autoFocus
              autoComplete="new-password"
              className={s.input}
            />
            <Clerk.FieldError className={s.fieldError} />
          </Clerk.Field>

          <Clerk.Field name="confirmPassword" className="block mb-6">
            <Clerk.Label className={s.label}>Confirm password</Clerk.Label>
            <Clerk.Input
              type="password"
              required
              autoComplete="new-password"
              className={s.input}
            />
            <Clerk.FieldError className={s.fieldError} />
          </Clerk.Field>

          <SignIn.Action submit asChild>
            <button type="submit" className={s.primaryButton}>
              Reset password
            </button>
          </SignIn.Action>
        </SignIn.Step>
      </SignIn.Root>
    </AuthShell>
  )
}
