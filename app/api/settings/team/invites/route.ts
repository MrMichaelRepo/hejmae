// Create a studio invite. Owner/admin only. Sends an email via Resend
// (soft-fails if Resend isn't configured).
import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, conflict } from '@/lib/errors'
import { createInvite } from '@/lib/validations/team'
import { generateMagicToken } from '@/lib/tokens'
import { sendEmail } from '@/lib/email/send'
import { renderStudioInviteEmail } from '@/lib/email/templates'
import { env } from '@/lib/env'

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requirePermission(ctx, 'team:manage')
    const body = createInvite.parse(await req.json())

    const sb = supabaseAdmin()

    // Reject if the email already belongs to a member of this studio.
    const { data: existingMembers, error: memberErr } = await sb
      .from('studio_members')
      .select('id, user:users!inner(id, email)')
      .eq('studio_id', ctx.studioId)
    if (memberErr) throw memberErr
    const existingMember = (existingMembers ?? []).find((m) => {
      const userField = (m as { user?: unknown }).user
      const userObj =
        Array.isArray(userField) && userField.length > 0
          ? userField[0]
          : userField
      const email =
        userObj &&
        typeof userObj === 'object' &&
        'email' in userObj &&
        typeof userObj.email === 'string'
          ? userObj.email
          : null
      return email?.toLowerCase() === body.email
    })
    if (existingMember) {
      throw conflict('That email is already a member of this studio')
    }

    // Reuse an active pending invite for the same email + studio (refresh
    // token, role, permissions, then resend) instead of stacking duplicates.
    const { data: existing } = await sb
      .from('studio_invites')
      .select('id')
      .eq('studio_id', ctx.studioId)
      .eq('email', body.email)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .maybeSingle()

    const token = generateMagicToken()
    let inviteId = existing?.id
    if (existing) {
      const { error } = await sb
        .from('studio_invites')
        .update({
          role: body.role,
          permissions: body.permissions,
          token,
          invited_by: ctx.userId,
          invited_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      if (error) throw error
    } else {
      const { data: inserted, error } = await sb
        .from('studio_invites')
        .insert({
          studio_id: ctx.studioId,
          email: body.email,
          role: body.role,
          permissions: body.permissions,
          token,
          invited_by: ctx.userId,
        })
        .select('id')
        .single()
      if (error) throw error
      inviteId = inserted.id
    }

    // Send the email. Branding pulls from the studio owner's user row.
    const { data: ownerRow } = await sb
      .from('users')
      .select('name, studio_name, logo_url, brand_color')
      .eq('id', ctx.designerId)
      .single()
    const inviterName = ctx.user.name || ctx.user.email
    const acceptUrl = `${env.appUrl()}/invite/${token}`
    const tpl = renderStudioInviteEmail({
      brand: {
        studio_name: ownerRow?.studio_name ?? null,
        name: ownerRow?.name ?? null,
        logo_url: ownerRow?.logo_url ?? null,
        brand_color: ownerRow?.brand_color ?? null,
      },
      inviterName,
      acceptUrl,
      role: body.role,
    })
    await sendEmail({
      to: body.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      replyTo: ctx.user.email,
    })

    return NextResponse.json(
      {
        data: {
          id: inviteId,
          email: body.email,
          role: body.role,
          permissions: body.permissions,
        },
      },
      { status: 201 },
    )
  })
}
