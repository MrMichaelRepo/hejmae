// Accept a studio invite. Requires the caller to be signed in (Clerk).
// We don't enforce email match against the invite — Clerk could be tied to
// a different primary email than the invite was sent to, and we trust the
// token (which was emailed to the invitee) as proof of intent.
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, unauthorized, notFound, badRequest } from '@/lib/errors'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  return withErrorHandling(async () => {
    const { userId: clerkUserId } = await auth()
    if (!clerkUserId) throw unauthorized('Sign in to accept this invite')

    const { token } = await params
    const sb = supabaseAdmin()

    // Resolve the caller's users.id (lazily provision a row if missing —
    // mirrors requireDesigner without forcing studio creation, since the
    // invite acceptance IS their first studio).
    const user = await loadOrCreateUser(sb, clerkUserId)

    const { data: invite, error: iErr } = await sb
      .from('studio_invites')
      .select('id, studio_id, role, permissions, accepted_at, revoked_at')
      .eq('token', token)
      .maybeSingle()
    if (iErr) throw iErr
    if (!invite) throw notFound('Invite not found')
    if (invite.revoked_at) throw badRequest('This invite was revoked')
    if (invite.accepted_at) throw badRequest('This invite was already accepted')

    // Idempotent and race-safe: upsert on (studio_id, user_id) so two accept
    // requests can't fail with a unique violation.
    const { error: memberErr } = await sb.from('studio_members').upsert(
      {
        studio_id: invite.studio_id,
        user_id: user.id,
        role: invite.role,
        permissions: invite.permissions ?? [],
      },
      { onConflict: 'studio_id,user_id' },
    )
    if (memberErr) throw memberErr

    const { data: acceptedInvite, error: acceptErr } = await sb
      .from('studio_invites')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invite.id)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .select('id')
      .maybeSingle()
    if (acceptErr) throw acceptErr
    if (!acceptedInvite) throw badRequest('Invite is no longer available')

    return NextResponse.json({
      data: { studio_id: invite.studio_id, role: invite.role },
    })
  })
}

async function loadOrCreateUser(
  sb: ReturnType<typeof supabaseAdmin>,
  clerkUserId: string,
): Promise<{ id: string; email: string }> {
  const { data } = await sb
    .from('users')
    .select('id, email')
    .eq('clerk_user_id', clerkUserId)
    .maybeSingle()
  if (data) return data

  const { clerkClient } = await import('@clerk/nextjs/server')
  const cc = await clerkClient()
  const cu = await cc.users.getUser(clerkUserId)
  const email =
    cu.primaryEmailAddress?.emailAddress ??
    cu.emailAddresses[0]?.emailAddress
  if (!email) throw unauthorized('Clerk user has no email address')

  const { data: inserted, error } = await sb
    .from('users')
    .upsert(
      {
        clerk_user_id: clerkUserId,
        email,
        name: [cu.firstName, cu.lastName].filter(Boolean).join(' ') || null,
      },
      { onConflict: 'clerk_user_id' },
    )
    .select('id, email')
    .single()
  if (error) throw error
  return inserted
}
