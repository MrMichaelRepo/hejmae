// Auth helpers for designer-facing API routes.
//
// Every request is authenticated by Clerk middleware. We then resolve the
// Clerk user id to our public.users.id. If the row is missing (e.g. the
// Clerk webhook hasn't fired yet), we lazily create one — this keeps a
// fresh signup from getting a 500 on their first request.

import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { UserRow } from '@/lib/supabase/types'
import { unauthorized } from '@/lib/errors'

export interface DesignerContext {
  clerkUserId: string
  designerId: string
  user: UserRow
}

export async function requireDesigner(): Promise<DesignerContext> {
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) throw unauthorized('Not signed in')

  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from('users')
    .select('*')
    .eq('clerk_user_id', clerkUserId)
    .maybeSingle()

  if (error) throw error
  if (data) {
    return {
      clerkUserId,
      designerId: data.id,
      user: data as UserRow,
    }
  }

  // Lazily provision the row if the webhook hasn't fired yet. We pull the
  // primary email from Clerk so this stays correct for first-time logins.
  // TODO: replace with a strict Clerk webhook + 401 here once the webhook
  // is wired up reliably.
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

  return {
    clerkUserId,
    designerId: inserted.id,
    user: inserted as UserRow,
  }
}
