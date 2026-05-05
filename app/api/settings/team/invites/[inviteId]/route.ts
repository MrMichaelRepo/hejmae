// Revoke a pending studio invite. Soft-revoke via revoked_at so the
// audit trail is preserved.
import { NextResponse } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound } from '@/lib/errors'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ inviteId: string }> },
) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requirePermission(ctx, 'team:manage')
    const { inviteId } = await params

    const sb = supabaseAdmin()
    const { data, error } = await sb
      .from('studio_invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', inviteId)
      .eq('studio_id', ctx.studioId)
      .is('revoked_at', null)
      .is('accepted_at', null)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) throw notFound('Invite not found or already settled')

    return NextResponse.json({ data: { id: data.id, revoked: true } })
  })
}
