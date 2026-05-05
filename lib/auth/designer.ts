// Auth helpers for designer-facing API routes.
//
// Every request is authenticated by Clerk middleware. We then resolve:
//   1. The Clerk user id → public.users row (the *caller*).
//   2. The caller's primary studio (the studio they own; falling back to
//      the first studio they're a member of for invitees who don't own one).
//   3. The caller's role + permissions on that studio.
//
// `designerId` in the returned context is the **studio owner's user id** —
// i.e. the tenant key that all data rows carry as `designer_id`. For solo
// studios this equals the caller's own user id; for invited team members
// it's the owner's id, so writes and reads stay scoped to the owner's data.
//
// If the caller has no `users` row yet (Clerk webhook hasn't fired) or no
// studio yet, we lazily provision both — that keeps a fresh signup from
// 500-ing on their first request.

import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { UserRow } from '@/lib/supabase/types'
import { unauthorized } from '@/lib/errors'

export type StudioRole = 'owner' | 'admin' | 'member'

export interface DesignerContext {
  clerkUserId: string
  // Caller's own users.id.
  userId: string
  // Studio owner's users.id == tenant key on all data rows. For solo studios
  // this equals userId.
  designerId: string
  studioId: string
  role: StudioRole
  permissions: string[]
  // Caller's user row (their own profile, not the studio owner's).
  user: UserRow
}

export async function requireDesigner(): Promise<DesignerContext> {
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) throw unauthorized('Not signed in')

  const sb = supabaseAdmin()
  const user = await loadOrCreateUser(sb, clerkUserId)
  const studio = await loadOrCreateStudio(sb, user)

  return {
    clerkUserId,
    userId: user.id,
    designerId: studio.designerId,
    studioId: studio.studioId,
    role: studio.role,
    permissions: studio.permissions,
    user,
  }
}

async function loadOrCreateUser(
  sb: ReturnType<typeof supabaseAdmin>,
  clerkUserId: string,
): Promise<UserRow> {
  const { data, error } = await sb
    .from('users')
    .select('*')
    .eq('clerk_user_id', clerkUserId)
    .maybeSingle()
  if (error) throw error
  if (data) return data as UserRow

  // Lazy-provision: pull email/name from Clerk.
  const { clerkClient } = await import('@clerk/nextjs/server')
  const cc = await clerkClient()
  const cu = await cc.users.getUser(clerkUserId)
  const email =
    cu.primaryEmailAddress?.emailAddress ??
    cu.emailAddresses[0]?.emailAddress ??
    null
  if (!email) throw unauthorized('Clerk user has no email address')

  const { data: inserted, error: insertErr } = await sb
    .from('users')
    .upsert(
      {
        clerk_user_id: clerkUserId,
        email,
        name: [cu.firstName, cu.lastName].filter(Boolean).join(' ') || null,
      },
      { onConflict: 'clerk_user_id' },
    )
    .select()
    .single()
  if (insertErr) throw insertErr
  return inserted as UserRow
}

interface ResolvedStudio {
  studioId: string
  designerId: string
  role: StudioRole
  permissions: string[]
}

async function loadOrCreateStudio(
  sb: ReturnType<typeof supabaseAdmin>,
  user: UserRow,
): Promise<ResolvedStudio> {
  // Prefer a studio the caller owns. Falls back to first membership.
  const { data: memberships, error } = await sb
    .from('studio_members')
    .select(
      'role, permissions, joined_at, studio:studios!inner(id, owner_user_id)',
    )
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true })
  if (error) throw error

  type Row = {
    role: StudioRole
    permissions: unknown
    studio: { id: string; owner_user_id: string }
  }
  const rows = (memberships ?? []) as unknown as Row[]
  const owned = rows.find((r) => r.role === 'owner')
  const primary = owned ?? rows[0]

  if (primary) {
    return {
      studioId: primary.studio.id,
      designerId: primary.studio.owner_user_id,
      role: primary.role,
      permissions: parsePermissions(primary.permissions),
    }
  }

  // No studios at all → create a one-person studio for the caller.
  const studioName =
    user.studio_name || user.name || user.email
  const { data: studio, error: sErr } = await sb
    .from('studios')
    .insert({
      name: `${studioName} — studio`,
      owner_user_id: user.id,
    })
    .select('id, owner_user_id')
    .single()
  if (sErr) throw sErr

  const { error: mErr } = await sb.from('studio_members').insert({
    studio_id: studio.id,
    user_id: user.id,
    role: 'owner',
    permissions: [],
  })
  if (mErr) throw mErr

  return {
    studioId: studio.id,
    designerId: studio.owner_user_id,
    role: 'owner',
    permissions: [],
  }
}

function parsePermissions(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}
