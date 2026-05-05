// Update or remove a studio member.
//
// Owners cannot be modified or removed via this route — they're the
// canonical tenant of every row. Owner reassignment is a separate, riskier
// flow we'll add later.
import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound, badRequest } from '@/lib/errors'
import { updateMember } from '@/lib/validations/team'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> },
) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requirePermission(ctx, 'team:manage')
    const { memberId } = await params
    const body = updateMember.parse(await req.json())

    const sb = supabaseAdmin()

    const { data: target, error: tErr } = await sb
      .from('studio_members')
      .select('id, role, user_id')
      .eq('id', memberId)
      .eq('studio_id', ctx.studioId)
      .maybeSingle()
    if (tErr) throw tErr
    if (!target) throw notFound('Member not found')
    if (target.role === 'owner') {
      throw badRequest('Cannot modify the studio owner')
    }

    const patch: { role?: string; permissions?: string[] } = {}
    if (body.role) patch.role = body.role
    if (body.permissions) patch.permissions = body.permissions

    const { data, error } = await sb
      .from('studio_members')
      .update(patch)
      .eq('id', memberId)
      .eq('studio_id', ctx.studioId)
      .select('id, role, permissions')
      .single()
    if (error) throw error

    return NextResponse.json({ data })
  })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ memberId: string }> },
) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requirePermission(ctx, 'team:manage')
    const { memberId } = await params

    const sb = supabaseAdmin()
    const { data: target, error: tErr } = await sb
      .from('studio_members')
      .select('id, role')
      .eq('id', memberId)
      .eq('studio_id', ctx.studioId)
      .maybeSingle()
    if (tErr) throw tErr
    if (!target) throw notFound('Member not found')
    if (target.role === 'owner') {
      throw badRequest('Cannot remove the studio owner')
    }

    const { error } = await sb
      .from('studio_members')
      .delete()
      .eq('id', memberId)
      .eq('studio_id', ctx.studioId)
    if (error) throw error
    return NextResponse.json({ data: { id: memberId, removed: true } })
  })
}
