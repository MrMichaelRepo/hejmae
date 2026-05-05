// Invite landing page. Accessible without sign-in — the token is the
// authorization for previewing. Accepting requires a Clerk session, so
// non-signed-in visitors are bounced to /sign-in?redirect_url=… and
// returned here afterwards.
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { api, ApiError } from '@/lib/api'
import { PageSpinner } from '@/components/ui/Spinner'
import Button from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'

interface InvitePreview {
  id: string
  email: string
  role: string
  status: 'pending' | 'accepted' | 'revoked'
  studio: {
    id: string
    name: string
    logo_url: string | null
    brand_color: string | null
    owner_name: string | null
  }
}

export default function InviteLandingPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const { isSignedIn, isLoaded } = useUser()
  const [invite, setInvite] = useState<InvitePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<InvitePreview>(`/api/invites/${token}`)
      .then((r) => setInvite((r.data as InvitePreview) ?? null))
      .catch((e) => {
        if (e instanceof ApiError) setError(e.message)
        else setError('Failed to load invite')
      })
      .finally(() => setLoading(false))
  }, [token])

  const accept = async () => {
    if (!isSignedIn) {
      const here = encodeURIComponent(`/invite/${token}`)
      router.push(`/sign-in?redirect_url=${here}`)
      return
    }
    setAccepting(true)
    try {
      await api.post(`/api/invites/${token}/accept`)
      toast.success('Welcome to the team')
      router.push('/dashboard')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setAccepting(false)
    }
  }

  if (loading || !isLoaded) return <PageSpinner />

  if (error || !invite) {
    return (
      <Centered>
        <h1 className="font-garamond text-3xl text-hm-text mb-4">Invite unavailable</h1>
        <p className="font-garamond text-[1rem] text-hm-nav">
          {error ?? 'This invite link is invalid.'}
        </p>
      </Centered>
    )
  }

  if (invite.status === 'revoked') {
    return (
      <Centered>
        <h1 className="font-garamond text-3xl text-hm-text mb-4">Invite revoked</h1>
        <p className="font-garamond text-[1rem] text-hm-nav">
          This invite was revoked. Ask the studio owner to send a new one.
        </p>
      </Centered>
    )
  }

  if (invite.status === 'accepted') {
    return (
      <Centered>
        <h1 className="font-garamond text-3xl text-hm-text mb-4">Already accepted</h1>
        <p className="font-garamond text-[1rem] text-hm-nav mb-6">
          You&apos;ve already joined this studio.
        </p>
        <Button variant="primary" onClick={() => router.push('/dashboard')}>
          Go to dashboard
        </Button>
      </Centered>
    )
  }

  return (
    <Centered brandColor={invite.studio.brand_color}>
      {invite.studio.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={invite.studio.logo_url}
          alt={invite.studio.name}
          className="h-10 mx-auto mb-6 object-contain"
        />
      ) : null}
      <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-3">
        Studio invite
      </div>
      <h1 className="font-garamond text-3xl md:text-4xl text-hm-text mb-3">
        Join {invite.studio.name}
      </h1>
      <p className="font-garamond text-[1rem] text-hm-nav mb-8">
        {invite.studio.owner_name
          ? `${invite.studio.owner_name} invited you`
          : 'You were invited'}{' '}
        to collaborate as a <strong>{invite.role}</strong>.
      </p>
      <Button
        variant="primary"
        onClick={accept}
        loading={accepting}
        size="lg"
      >
        {isSignedIn ? 'Accept invite' : 'Sign in to accept'}
      </Button>
      <p className="mt-4 font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav/70">
        Sent to {invite.email}
      </p>
    </Centered>
  )
}

function Centered({
  children,
  brandColor,
}: {
  children: React.ReactNode
  brandColor?: string | null
}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-6 py-16"
      style={brandColor ? { borderTop: `4px solid ${brandColor}` } : undefined}
    >
      <div className="max-w-md w-full text-center">{children}</div>
    </div>
  )
}
