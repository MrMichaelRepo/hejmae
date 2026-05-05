// List team members + pending invites for the caller's studio.
import { NextResponse } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'

export async function GET() {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requirePermission(ctx, 'team:manage')

    const sb = supabaseAdmin()

    const { data: members, error: mErr } = await sb
      .from('studio_members')
      .select(
        'id, role, permissions, joined_at, user:users!inner(id, name, email)',
      )
      .eq('studio_id', ctx.studioId)
      .order('joined_at', { ascending: true })
    if (mErr) throw mErr

    const { data: invites, error: iErr } = await sb
      .from('studio_invites')
      .select('id, email, role, invited_at, accepted_at, revoked_at')
      .eq('studio_id', ctx.studioId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('invited_at', { ascending: false })
    if (iErr) throw iErr

    return NextResponse.json({
      data: {
        studio_id: ctx.studioId,
        my_role: ctx.role,
        members,
        invites,
      },
    })
  })
}
