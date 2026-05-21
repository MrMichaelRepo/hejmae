'use client'

// Native account-management surface for Studio settings → Account.
// Replaces Clerk's embedded <UserProfile/> so the visual language stays
// consistent with the rest of the studio. Each subsection drives the
// underlying Clerk JS SDK directly via the useUser / useClerk hooks; the
// flows mirror Clerk's defaults (verify-by-code for new emails/phones,
// current-password gate for updates when one exists, etc.) but render
// with hejmae's Field/Input/Button primitives.
//
// Two-factor (TOTP / SMS / backup codes) is fully opt-in: no surface
// mutates 2FA state unless the user explicitly clicks Add / Enable /
// Generate. Passkeys are intentionally omitted.

import { useEffect, useRef, useState } from 'react'
import { useUser, useClerk } from '@clerk/nextjs'
import type {
  UserResource,
  EmailAddressResource,
  PhoneNumberResource,
  ExternalAccountResource,
  SessionWithActivitiesResource,
  TOTPResource,
  OAuthStrategy,
} from '@clerk/types'
import { QRCodeSVG } from 'qrcode.react'
import Button from '@/components/ui/Button'
import { Field, Input, Label } from '@/components/ui/Input'
import { Checkbox } from '@/components/ui/Checkbox'
import { Badge } from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { toast } from '@/components/ui/Toast'
import { GoogleIcon } from '@/components/auth'

export default function AccountSection() {
  const { user, isLoaded } = useUser()

  if (!isLoaded) {
    return (
      <div className="font-garamond text-[0.95rem] text-ink-muted">
        Loading account…
      </div>
    )
  }
  if (!user) {
    return (
      <div className="font-garamond text-[0.95rem] text-ink-muted">
        You must be signed in to manage your account.
      </div>
    )
  }

  return (
    <div className="divide-y divide-line">
      <Block title="Profile">
        <IdentityRow user={user} />
      </Block>

      <Block
        title="Email addresses"
        subtitle="Used for sign-in, password reset, and account notifications."
      >
        <EmailList user={user} />
      </Block>

      <Block
        title="Phone numbers"
        subtitle="Optional — useful for sign-in by code."
      >
        <PhoneList user={user} />
      </Block>

      <Block
        title="Password"
        subtitle={
          user.passwordEnabled
            ? 'Change the password used to sign in to hejmae.'
            : 'No password set. Add one to sign in without a third-party provider.'
        }
      >
        <PasswordRow user={user} />
      </Block>

      <Block
        title="Connected accounts"
        subtitle="Sign in with a third-party provider."
      >
        <ConnectedAccounts user={user} />
      </Block>

      <Block
        title="Two-factor authentication"
        subtitle={
          user.twoFactorEnabled
            ? 'Two-factor sign-in is active. Use the controls below to add, change, or remove a factor.'
            : 'Require a second factor in addition to your password when signing in.'
        }
      >
        <MfaBlock user={user} />
      </Block>

      <Block
        title="Active sessions"
        subtitle="Devices currently signed in to your account."
      >
        <SessionsList user={user} />
      </Block>

      <Block
        title="Delete account"
        subtitle="Permanently remove your account and all studio data."
      >
        <DeleteAccount user={user} />
      </Block>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Layout primitives
// ─────────────────────────────────────────────────────────────────────────

function Block({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="py-7 first:pt-0 last:pb-0">
      <div className="font-garamond text-[1.15rem] text-ink leading-none mb-1.5">
        {title}
      </div>
      {subtitle ? (
        <p className="font-garamond text-[0.9rem] text-ink-muted mb-4 max-w-xl">
          {subtitle}
        </p>
      ) : (
        <div className="mb-4" />
      )}
      {children}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-t border-line first:border-t-0">
      {children}
    </div>
  )
}

// Convert any thrown value (Clerk SDK throws shaped errors) into a string.
function errMessage(e: unknown): string {
  if (!e) return 'Something went wrong'
  const anyErr = e as { errors?: Array<{ longMessage?: string; message?: string }>; message?: string }
  if (anyErr.errors?.length) {
    return anyErr.errors[0].longMessage || anyErr.errors[0].message || 'Request failed'
  }
  return anyErr.message || 'Request failed'
}

// ─────────────────────────────────────────────────────────────────────────
// Identity (avatar + name)
// ─────────────────────────────────────────────────────────────────────────

function IdentityRow({ user }: { user: UserResource }) {
  const [firstName, setFirstName] = useState(user.firstName ?? '')
  const [lastName, setLastName] = useState(user.lastName ?? '')
  const [savingName, setSavingName] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const nameDirty =
    (firstName ?? '') !== (user.firstName ?? '') ||
    (lastName ?? '') !== (user.lastName ?? '')

  const saveName = async () => {
    setSavingName(true)
    try {
      await user.update({ firstName, lastName })
      toast.success('Name updated')
    } catch (e) {
      toast.error(errMessage(e))
    } finally {
      setSavingName(false)
    }
  }

  const onPickFile = () => fileRef.current?.click()

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      await user.setProfileImage({ file })
      toast.success('Photo updated')
    } catch (err) {
      toast.error(errMessage(err))
    } finally {
      setUploading(false)
    }
  }

  const removePhoto = async () => {
    setUploading(true)
    try {
      await user.setProfileImage({ file: null })
      toast.success('Photo removed')
    } catch (err) {
      toast.error(errMessage(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-6">
      <div className="flex flex-col items-center gap-3 shrink-0">
        <div className="w-20 h-20 rounded-full overflow-hidden border border-line bg-bg-elevated">
          {user.hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.imageUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-garamond text-[1.4rem] text-ink-muted">
              {(firstName?.[0] || user.primaryEmailAddress?.emailAddress?.[0] || '?').toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex gap-1.5">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFileChange}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={onPickFile}
            loading={uploading}
          >
            Upload
          </Button>
          {user.hasImage ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={removePhoto}
              disabled={uploading}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="First name">
            <Input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jane"
            />
          </Field>
          <Field label="Last name">
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Doe"
            />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            onClick={saveName}
            disabled={!nameDirty}
            loading={savingName}
          >
            Save name
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Email addresses
// ─────────────────────────────────────────────────────────────────────────

function EmailList({ user }: { user: UserResource }) {
  const confirm = useConfirm()
  const [adding, setAdding] = useState(false)

  const setPrimary = async (e: EmailAddressResource) => {
    try {
      await user.update({ primaryEmailAddressId: e.id })
      toast.success('Primary email updated')
    } catch (err) {
      toast.error(errMessage(err))
    }
  }

  const remove = async (e: EmailAddressResource) => {
    if (e.id === user.primaryEmailAddressId) {
      toast.error('Set another email as primary before removing this one.')
      return
    }
    const ok = await confirm({
      title: `Remove ${e.emailAddress}?`,
      body: 'You will no longer be able to sign in with this email.',
      confirmLabel: 'Remove',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await e.destroy()
      toast.success('Email removed')
    } catch (err) {
      toast.error(errMessage(err))
    }
  }

  return (
    <>
      <div>
        {user.emailAddresses.map((e) => {
          const isPrimary = e.id === user.primaryEmailAddressId
          const verified = e.verification?.status === 'verified'
          return (
            <Row key={e.id}>
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-garamond text-[1rem] text-ink truncate">
                  {e.emailAddress}
                </span>
                {isPrimary ? <Badge tone="terra">Primary</Badge> : null}
                {!verified ? <Badge tone="amber">Unverified</Badge> : null}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {!verified ? (
                  <VerifyEmailButton email={e} />
                ) : !isPrimary ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPrimary(e)}
                  >
                    Make primary
                  </Button>
                ) : null}
                {!isPrimary ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="!text-danger hover:!bg-danger/[0.08]"
                    onClick={() => remove(e)}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </Row>
          )
        })}
      </div>
      <div className="mt-4">
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
          + Add email
        </Button>
      </div>
      <AddEmailModal
        open={adding}
        onClose={() => setAdding(false)}
        user={user}
      />
    </>
  )
}

function VerifyEmailButton({ email }: { email: EmailAddressResource }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Verify
      </Button>
      <VerifyEmailModal
        open={open}
        onClose={() => setOpen(false)}
        email={email}
      />
    </>
  )
}

function AddEmailModal({
  open,
  onClose,
  user,
}: {
  open: boolean
  onClose: () => void
  user: UserResource
}) {
  const [email, setEmail] = useState('')
  const [created, setCreated] = useState<EmailAddressResource | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const close = () => {
    setEmail('')
    setCreated(null)
    setCode('')
    setBusy(false)
    onClose()
  }

  const submitEmail = async () => {
    if (!email) return
    setBusy(true)
    try {
      const created = await user.createEmailAddress({ email })
      await created.prepareVerification({ strategy: 'email_code' })
      setCreated(created)
      toast.info('Verification code sent')
    } catch (e) {
      toast.error(errMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const submitCode = async () => {
    if (!created || !code) return
    setBusy(true)
    try {
      await created.attemptVerification({ code })
      toast.success('Email verified')
      close()
    } catch (e) {
      toast.error(errMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title="Add email" size="sm">
      {!created ? (
        <>
          <Field label="Email address" hint="We'll send a 6-digit code to confirm.">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@studio.com"
              autoFocus
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitEmail} loading={busy} disabled={!email}>
              Send code
            </Button>
          </div>
        </>
      ) : (
        <>
          <Field
            label="Verification code"
            hint={`Sent to ${created.emailAddress}.`}
          >
            <Input
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              autoFocus
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitCode} loading={busy} disabled={!code}>
              Verify
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}

function VerifyEmailModal({
  open,
  onClose,
  email,
}: {
  open: boolean
  onClose: () => void
  email: EmailAddressResource
}) {
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || sent) return
    let cancelled = false
    ;(async () => {
      try {
        await email.prepareVerification({ strategy: 'email_code' })
        if (!cancelled) setSent(true)
      } catch (e) {
        toast.error(errMessage(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, email, sent])

  const submit = async () => {
    if (!code) return
    setBusy(true)
    try {
      await email.attemptVerification({ code })
      toast.success('Email verified')
      setCode('')
      setSent(false)
      onClose()
    } catch (e) {
      toast.error(errMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    setCode('')
    setSent(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={close} title="Verify email" size="sm">
      <Field
        label="Verification code"
        hint={`Sent to ${email.emailAddress}.`}
      >
        <Input
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          autoFocus
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} loading={busy} disabled={!code}>
          Verify
        </Button>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Phone numbers
// ─────────────────────────────────────────────────────────────────────────

function PhoneList({ user }: { user: UserResource }) {
  const confirm = useConfirm()
  const [adding, setAdding] = useState(false)

  const setPrimary = async (p: PhoneNumberResource) => {
    try {
      await user.update({ primaryPhoneNumberId: p.id })
      toast.success('Primary phone updated')
    } catch (err) {
      toast.error(errMessage(err))
    }
  }

  const remove = async (p: PhoneNumberResource) => {
    const ok = await confirm({
      title: `Remove ${p.phoneNumber}?`,
      confirmLabel: 'Remove',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await p.destroy()
      toast.success('Phone removed')
    } catch (err) {
      toast.error(errMessage(err))
    }
  }

  return (
    <>
      {user.phoneNumbers.length === 0 ? (
        <div className="font-garamond text-[0.95rem] text-ink-muted">
          No phone numbers on file.
        </div>
      ) : (
        <div>
          {user.phoneNumbers.map((p) => {
            const isPrimary = p.id === user.primaryPhoneNumberId
            const verified = p.verification?.status === 'verified'
            return (
              <Row key={p.id}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-garamond text-[1rem] text-ink truncate">
                    {p.phoneNumber}
                  </span>
                  {isPrimary ? <Badge tone="terra">Primary</Badge> : null}
                  {!verified ? <Badge tone="amber">Unverified</Badge> : null}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!verified ? (
                    <VerifyPhoneButton phone={p} />
                  ) : !isPrimary ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPrimary(p)}
                    >
                      Make primary
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="!text-danger hover:!bg-danger/[0.08]"
                    onClick={() => remove(p)}
                  >
                    Remove
                  </Button>
                </div>
              </Row>
            )
          })}
        </div>
      )}
      <div className="mt-4">
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
          + Add phone
        </Button>
      </div>
      <AddPhoneModal
        open={adding}
        onClose={() => setAdding(false)}
        user={user}
      />
    </>
  )
}

function VerifyPhoneButton({ phone }: { phone: PhoneNumberResource }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Verify
      </Button>
      <VerifyPhoneModal
        open={open}
        onClose={() => setOpen(false)}
        phone={phone}
      />
    </>
  )
}

function AddPhoneModal({
  open,
  onClose,
  user,
}: {
  open: boolean
  onClose: () => void
  user: UserResource
}) {
  const [phone, setPhone] = useState('')
  const [created, setCreated] = useState<PhoneNumberResource | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const close = () => {
    setPhone('')
    setCreated(null)
    setCode('')
    setBusy(false)
    onClose()
  }

  const submitPhone = async () => {
    if (!phone) return
    setBusy(true)
    try {
      const created = await user.createPhoneNumber({ phoneNumber: phone })
      await created.prepareVerification()
      setCreated(created)
      toast.info('Code sent by SMS')
    } catch (e) {
      toast.error(errMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const submitCode = async () => {
    if (!created || !code) return
    setBusy(true)
    try {
      await created.attemptVerification({ code })
      toast.success('Phone verified')
      close()
    } catch (e) {
      toast.error(errMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title="Add phone" size="sm">
      {!created ? (
        <>
          <Field
            label="Phone number"
            hint="Include the country code, e.g. +1 415 555 1234."
          >
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+14155551234"
              autoFocus
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitPhone} loading={busy} disabled={!phone}>
              Send code
            </Button>
          </div>
        </>
      ) : (
        <>
          <Field
            label="Verification code"
            hint={`Sent to ${created.phoneNumber}.`}
          >
            <Input
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              autoFocus
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitCode} loading={busy} disabled={!code}>
              Verify
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}

function VerifyPhoneModal({
  open,
  onClose,
  phone,
}: {
  open: boolean
  onClose: () => void
  phone: PhoneNumberResource
}) {
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || sent) return
    let cancelled = false
    ;(async () => {
      try {
        await phone.prepareVerification()
        if (!cancelled) setSent(true)
      } catch (e) {
        toast.error(errMessage(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, phone, sent])

  const submit = async () => {
    if (!code) return
    setBusy(true)
    try {
      await phone.attemptVerification({ code })
      toast.success('Phone verified')
      setCode('')
      setSent(false)
      onClose()
    } catch (e) {
      toast.error(errMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    setCode('')
    setSent(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={close} title="Verify phone" size="sm">
      <Field label="Verification code" hint={`Sent to ${phone.phoneNumber}.`}>
        <Input
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          autoFocus
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} loading={busy} disabled={!code}>
          Verify
        </Button>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Password
// ─────────────────────────────────────────────────────────────────────────

function PasswordRow({ user }: { user: UserResource }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        {user.passwordEnabled ? 'Change password' : 'Set password'}
      </Button>
      <PasswordModal open={open} onClose={() => setOpen(false)} user={user} />
    </>
  )
}

function PasswordModal({
  open,
  onClose,
  user,
}: {
  open: boolean
  onClose: () => void
  user: UserResource
}) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [signOutOthers, setSignOutOthers] = useState(true)
  const [busy, setBusy] = useState(false)

  const close = () => {
    setCurrent('')
    setNext('')
    setConfirmPw('')
    setSignOutOthers(true)
    setBusy(false)
    onClose()
  }

  const submit = async () => {
    if (next !== confirmPw) {
      toast.error('Passwords do not match')
      return
    }
    if (next.length < 8) {
      toast.error('Use at least 8 characters')
      return
    }
    setBusy(true)
    try {
      await user.updatePassword({
        newPassword: next,
        currentPassword: user.passwordEnabled ? current : undefined,
        signOutOfOtherSessions: signOutOthers,
      })
      toast.success(user.passwordEnabled ? 'Password updated' : 'Password set')
      close()
    } catch (e) {
      toast.error(errMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={user.passwordEnabled ? 'Change password' : 'Set password'}
      size="sm"
    >
      {user.passwordEnabled ? (
        <Field label="Current password">
          <Input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
      ) : null}
      <Field label="New password" hint="At least 8 characters.">
        <Input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
        />
      </Field>
      <Field label="Confirm new password">
        <Input
          type="password"
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          autoComplete="new-password"
        />
      </Field>
      <div className="mb-5">
        <Checkbox
          checked={signOutOthers}
          onChange={(e) => setSignOutOthers(e.target.checked)}
          label="Sign out of other devices"
          hint="Recommended if you suspect another session is unauthorized."
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={submit}
          loading={busy}
          disabled={!next || !confirmPw || (user.passwordEnabled && !current)}
        >
          {user.passwordEnabled ? 'Update password' : 'Set password'}
        </Button>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Connected accounts (Google OAuth — only provider enabled in this app)
// ─────────────────────────────────────────────────────────────────────────

const PROVIDERS: Array<{
  strategy: OAuthStrategy
  label: string
  match: (a: ExternalAccountResource) => boolean
  icon: () => JSX.Element
}> = [
  {
    strategy: 'oauth_google',
    label: 'Google',
    match: (a) => a.provider === 'google',
    icon: () => <GoogleIcon />,
  },
]

function ConnectedAccounts({ user }: { user: UserResource }) {
  const confirm = useConfirm()
  const [busy, setBusy] = useState<string | null>(null)

  const connect = async (strategy: OAuthStrategy) => {
    setBusy(strategy)
    try {
      const external = await user.createExternalAccount({
        strategy,
        redirectUrl: window.location.href,
      })
      const url = external.verification?.externalVerificationRedirectURL
      if (url) {
        window.location.href = url.toString()
        return
      }
      toast.success('Account linked')
    } catch (e) {
      toast.error(errMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async (a: ExternalAccountResource, label: string) => {
    const ok = await confirm({
      title: `Disconnect ${label}?`,
      body: 'You will no longer be able to sign in with this provider.',
      confirmLabel: 'Disconnect',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(a.id)
    try {
      await a.destroy()
      toast.success(`${label} disconnected`)
    } catch (e) {
      toast.error(errMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      {PROVIDERS.map((p) => {
        // Use verifiedExternalAccounts so an abandoned OAuth attempt (created
        // but never completed) doesn't permanently show as "linked" and block
        // the user from retrying the Connect flow.
        const linked = user.verifiedExternalAccounts.find(p.match)
        return (
          <Row key={p.strategy}>
            <div className="flex items-center gap-3 min-w-0">
              <span className="shrink-0">{p.icon()}</span>
              <span className="font-garamond text-[1rem] text-ink">
                {p.label}
              </span>
              {linked ? (
                <span className="font-garamond text-[0.9rem] text-ink-muted truncate">
                  · {linked.emailAddress}
                </span>
              ) : null}
            </div>
            <div className="shrink-0">
              {linked ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="!text-danger hover:!bg-danger/[0.08]"
                  loading={busy === linked.id}
                  onClick={() => disconnect(linked, p.label)}
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === p.strategy}
                  onClick={() => connect(p.strategy)}
                >
                  Connect
                </Button>
              )}
            </div>
          </Row>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Active sessions
// ─────────────────────────────────────────────────────────────────────────

function SessionsList({ user }: { user: UserResource }) {
  const { session: currentSession } = useClerk()
  const confirm = useConfirm()
  const [sessions, setSessions] = useState<SessionWithActivitiesResource[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = async () => {
    try {
      const s = await user.getSessions()
      setSessions(s)
    } catch (e) {
      toast.error(errMessage(e))
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const revoke = async (s: SessionWithActivitiesResource) => {
    const ok = await confirm({
      title: 'Sign out this device?',
      confirmLabel: 'Sign out',
      tone: 'danger',
    })
    if (!ok) return
    setBusyId(s.id)
    try {
      await s.revoke()
      toast.success('Session signed out')
      await refresh()
    } catch (e) {
      toast.error(errMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  if (!sessions) {
    return (
      <div className="font-garamond text-[0.95rem] text-ink-muted">
        Loading sessions…
      </div>
    )
  }

  return (
    <div>
      {sessions.map((s) => {
        // Only treat as "current" when we have a confirmed session id from
        // useClerk. While currentSession is loading, suppress the Sign-out
        // button on every row so the user can't accidentally revoke their
        // own device.
        const isCurrent = !!currentSession && currentSession.id === s.id
        const canRevoke = !!currentSession && !isCurrent
        const act = s.latestActivity
        const device =
          [act?.browserName, act?.deviceType].filter(Boolean).join(' · ') ||
          (act?.isMobile ? 'Mobile device' : 'Desktop')
        const where =
          [act?.city, act?.country].filter(Boolean).join(', ') ||
          act?.ipAddress ||
          'Unknown location'
        return (
          <Row key={s.id}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-garamond text-[1rem] text-ink">
                  {device}
                </span>
                {isCurrent ? <Badge tone="sage">This device</Badge> : null}
              </div>
              <div className="font-garamond text-[0.85rem] text-ink-muted mt-0.5">
                {where} · Last active{' '}
                {s.lastActiveAt ? s.lastActiveAt.toLocaleString() : '—'}
              </div>
            </div>
            {canRevoke ? (
              <Button
                size="sm"
                variant="ghost"
                className="!text-danger hover:!bg-danger/[0.08]"
                loading={busyId === s.id}
                onClick={() => revoke(s)}
              >
                Sign out
              </Button>
            ) : null}
          </Row>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Multi-factor authentication (TOTP + SMS + backup codes)
// ─────────────────────────────────────────────────────────────────────────

function MfaBlock({ user }: { user: UserResource }) {
  const confirm = useConfirm()
  const [setupOpen, setSetupOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [codesModal, setCodesModal] = useState<{
    codes: string[]
    isRegen: boolean
  } | null>(null)

  const removeTotp = async () => {
    const ok = await confirm({
      title: 'Remove authenticator app?',
      body: 'You will no longer be prompted for a code from your authenticator on sign-in.',
      confirmLabel: 'Remove',
      tone: 'danger',
    })
    if (!ok) return
    setBusyId('totp')
    try {
      await user.disableTOTP()
      toast.success('Authenticator removed')
    } catch (e) {
      toast.error(errMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  const verifiedPhones = user.phoneNumbers.filter(
    (p) => p.verification?.status === 'verified',
  )

  const enablePhone = async (p: PhoneNumberResource) => {
    setBusyId(p.id)
    try {
      await p.setReservedForSecondFactor({ reserved: true })
      toast.success('SMS two-factor enabled')
    } catch (e) {
      toast.error(errMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  const disablePhone = async (p: PhoneNumberResource) => {
    const ok = await confirm({
      title: `Stop using ${p.phoneNumber} as a second factor?`,
      confirmLabel: 'Disable',
      tone: 'danger',
    })
    if (!ok) return
    setBusyId(p.id)
    try {
      await p.setReservedForSecondFactor({ reserved: false })
      toast.success('SMS two-factor disabled')
    } catch (e) {
      toast.error(errMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  const makeDefault = async (p: PhoneNumberResource) => {
    setBusyId(p.id)
    try {
      await p.makeDefaultSecondFactor()
      toast.success('Default second factor updated')
    } catch (e) {
      toast.error(errMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  const generateBackup = async () => {
    if (user.backupCodeEnabled) {
      const ok = await confirm({
        title: 'Regenerate backup codes?',
        body: 'Your previous backup codes will stop working immediately.',
        confirmLabel: 'Regenerate',
        tone: 'danger',
      })
      if (!ok) return
    }
    setBusyId('backup')
    try {
      const res = await user.createBackupCode()
      setCodesModal({ codes: res.codes, isRegen: user.backupCodeEnabled })
    } catch (e) {
      toast.error(errMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      {/* Authenticator app (TOTP) */}
      <Row>
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="font-garamond text-[1rem] text-ink">
              Authenticator app
            </span>
            {user.totpEnabled ? <Badge tone="sage">Active</Badge> : null}
          </div>
          <div className="font-garamond text-[0.85rem] text-ink-muted mt-0.5">
            Use an app like 1Password, Authy, or Google Authenticator to
            generate a 6-digit code.
          </div>
        </div>
        <div className="shrink-0">
          {user.totpEnabled ? (
            <Button
              size="sm"
              variant="ghost"
              className="!text-danger hover:!bg-danger/[0.08]"
              loading={busyId === 'totp'}
              onClick={removeTotp}
            >
              Remove
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setSetupOpen(true)}>
              Add
            </Button>
          )}
        </div>
      </Row>

      {/* SMS second factor — only verified phones */}
      {verifiedPhones.length === 0 ? (
        <Row>
          <div className="min-w-0">
            <span className="font-garamond text-[1rem] text-ink">
              Text message (SMS)
            </span>
            <div className="font-garamond text-[0.85rem] text-ink-muted mt-0.5">
              Add and verify a phone number above to use SMS as a second
              factor.
            </div>
          </div>
        </Row>
      ) : (
        verifiedPhones.map((p) => (
          <Row key={p.id}>
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span className="font-garamond text-[1rem] text-ink">
                  SMS · {p.phoneNumber}
                </span>
                {p.reservedForSecondFactor ? (
                  <Badge tone="sage">Active</Badge>
                ) : null}
                {p.defaultSecondFactor ? (
                  <Badge tone="terra">Default</Badge>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {p.reservedForSecondFactor && !p.defaultSecondFactor ? (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busyId === p.id}
                  onClick={() => makeDefault(p)}
                >
                  Make default
                </Button>
              ) : null}
              {p.reservedForSecondFactor ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="!text-danger hover:!bg-danger/[0.08]"
                  loading={busyId === p.id}
                  onClick={() => disablePhone(p)}
                >
                  Disable
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busyId === p.id}
                  onClick={() => enablePhone(p)}
                >
                  Enable
                </Button>
              )}
            </div>
          </Row>
        ))
      )}

      {/* Backup codes */}
      <Row>
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="font-garamond text-[1rem] text-ink">
              Backup codes
            </span>
            {user.backupCodeEnabled ? <Badge tone="sage">Active</Badge> : null}
          </div>
          <div className="font-garamond text-[0.85rem] text-ink-muted mt-0.5">
            One-time codes you can use if you lose access to your other
            factors. Available once a factor above is active.
          </div>
        </div>
        <div className="shrink-0">
          <Button
            size="sm"
            variant="secondary"
            loading={busyId === 'backup'}
            onClick={generateBackup}
            disabled={!user.twoFactorEnabled}
          >
            {user.backupCodeEnabled ? 'Regenerate' : 'Generate'}
          </Button>
        </div>
      </Row>

      <TotpSetupModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        user={user}
      />
      <BackupCodesModal
        codes={codesModal?.codes ?? null}
        isRegen={codesModal?.isRegen ?? false}
        onClose={() => setCodesModal(null)}
      />
    </div>
  )
}

function TotpSetupModal({
  open,
  onClose,
  user,
}: {
  open: boolean
  onClose: () => void
  user: UserResource
}) {
  const [totp, setTotp] = useState<TOTPResource | null>(null)
  const [loading, setLoading] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  useEffect(() => {
    if (!open || totp || loading) return
    let cancelled = false
    setLoading(true)
    user
      .createTOTP()
      .then((t) => {
        if (!cancelled) setTotp(t)
      })
      .catch((e) => {
        if (cancelled) return
        toast.error(errMessage(e))
        onClose()
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const close = () => {
    setTotp(null)
    setCode('')
    setShowSecret(false)
    setBusy(false)
    onClose()
  }

  const submit = async () => {
    if (!code) return
    setBusy(true)
    try {
      await user.verifyTOTP({ code })
      toast.success('Authenticator app added')
      close()
    } catch (e) {
      toast.error(errMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const copySecret = async () => {
    if (!totp?.secret) return
    try {
      await navigator.clipboard.writeText(totp.secret)
      toast.success('Secret copied')
    } catch {
      toast.error('Could not copy')
    }
  }

  return (
    <Modal open={open} onClose={close} title="Add authenticator app" size="md">
      {loading || !totp ? (
        <div className="font-garamond text-[0.95rem] text-ink-muted py-8 text-center">
          Generating setup code…
        </div>
      ) : (
        <>
          <ol className="space-y-5 mb-6">
            <li className="flex gap-4">
              <span className="font-garamond text-[1.2rem] text-ink-muted leading-none w-5 shrink-0">
                1.
              </span>
              <div className="font-garamond text-[1rem] text-ink leading-[1.5]">
                Open your authenticator app (1Password, Authy, Google
                Authenticator, etc.).
              </div>
            </li>
            <li className="flex gap-4">
              <span className="font-garamond text-[1.2rem] text-ink-muted leading-none w-5 shrink-0">
                2.
              </span>
              <div className="flex-1">
                <div className="font-garamond text-[1rem] text-ink leading-[1.5] mb-3">
                  Scan this QR code:
                </div>
                <div className="inline-block p-3 bg-surface border border-line rounded">
                  {totp.uri ? (
                    <QRCodeSVG
                      value={totp.uri}
                      size={168}
                      bgColor="#fbfaf6"
                      fgColor="#1e2128"
                      level="M"
                    />
                  ) : null}
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setShowSecret((s) => !s)}
                    className="font-sans text-[10px] uppercase tracking-[0.2em] text-ink-muted hover:text-ink"
                  >
                    {showSecret ? 'Hide secret' : "Can't scan? Enter manually"}
                  </button>
                  {showSecret ? (
                    <div className="mt-2 flex items-center gap-2">
                      <code className="flex-1 font-mono text-[0.85rem] text-ink bg-surface border border-line rounded px-3 py-2 break-all">
                        {totp.secret}
                      </code>
                      <Button size="sm" variant="ghost" onClick={copySecret}>
                        Copy
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="font-garamond text-[1.2rem] text-ink-muted leading-none w-5 shrink-0">
                3.
              </span>
              <div className="flex-1">
                <Field label="Enter the 6-digit code from your app">
                  <Input
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123456"
                    autoFocus
                  />
                </Field>
              </div>
            </li>
          </ol>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={submit}
              loading={busy}
              disabled={!code}
            >
              Verify & enable
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}

function BackupCodesModal({
  codes,
  isRegen,
  onClose,
}: {
  codes: string[] | null
  isRegen: boolean
  onClose: () => void
}) {
  const open = !!codes
  const copy = async () => {
    if (!codes) return
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      toast.success('Codes copied')
    } catch {
      toast.error('Could not copy')
    }
  }
  const download = () => {
    if (!codes) return
    const blob = new Blob([codes.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'hejmae-backup-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isRegen ? 'New backup codes' : 'Backup codes'}
      size="sm"
    >
      <p className="font-garamond text-[1rem] text-ink-muted leading-[1.6] mb-4">
        Save these one-time codes somewhere safe. Each works only once.{' '}
        <strong className="text-ink">We won&rsquo;t show them again.</strong>
      </p>
      {codes ? (
        <div className="grid grid-cols-2 gap-2 bg-surface border border-line rounded p-4 mb-5">
          {codes.map((c) => (
            <code
              key={c}
              className="font-mono text-[0.9rem] text-ink tracking-wider"
            >
              {c}
            </code>
          ))}
        </div>
      ) : null}
      <div className="flex justify-between items-center gap-2">
        <div className="flex gap-1.5">
          <Button size="sm" variant="secondary" onClick={copy}>
            Copy
          </Button>
          <Button size="sm" variant="ghost" onClick={download}>
            Download
          </Button>
        </div>
        <Button variant="primary" onClick={onClose}>
          I&rsquo;ve saved them
        </Button>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Delete account
// ─────────────────────────────────────────────────────────────────────────

function DeleteAccount({ user }: { user: UserResource }) {
  const { signOut } = useClerk()
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)

  const close = () => {
    setOpen(false)
    setConfirmText('')
    setBusy(false)
  }

  const submit = async () => {
    if (confirmText !== 'delete') return
    setBusy(true)
    try {
      await user.delete()
    } catch (e) {
      toast.error(errMessage(e))
      setBusy(false)
      return
    }
    // Account is gone — try signOut to clean up the local session, but if
    // it throws (session is already invalidated server-side) just navigate
    // away ourselves so we never leave the user stuck on a dead page.
    try {
      await signOut({ redirectUrl: '/' })
    } catch {
      window.location.href = '/'
    }
  }

  return (
    <>
      <p className="font-garamond text-[0.9rem] text-ink-muted mb-3 max-w-xl">
        This action is irreversible. Projects, clients, invoices, and uploads
        tied to this account will be permanently removed.
      </p>
      <Button
        size="sm"
        variant="danger"
        onClick={() => setOpen(true)}
      >
        Delete account
      </Button>
      <Modal open={open} onClose={close} title="Delete account" size="sm">
        <p className="font-garamond text-[1rem] text-ink-muted leading-[1.6] mb-4">
          To confirm, type{' '}
          <span className="font-sans uppercase tracking-[0.2em] text-[10px] text-ink">
            delete
          </span>{' '}
          below.
        </p>
        <Field>
          <Label>Confirmation</Label>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="delete"
            autoFocus
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={submit}
            loading={busy}
            disabled={confirmText !== 'delete'}
          >
            Delete account
          </Button>
        </div>
      </Modal>
    </>
  )
}
