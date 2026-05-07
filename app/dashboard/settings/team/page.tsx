import { requireDesigner } from '@/lib/auth/designer'
import { hasPermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import TeamClient, { type TeamData } from './TeamClient'

export default async function TeamSettingsPage() {
  const ctx = await requireDesigner()
  if (!hasPermission(ctx, 'team:manage')) {
    return <TeamClient initialData={null} />
  }

  const sb = supabaseAdmin()

  const [membersRes, invitesRes] = await Promise.all([
    sb
      .from('studio_members')
      .select(
        'id, role, permissions, joined_at, user:users!inner(id, name, email)',
      )
      .eq('studio_id', ctx.studioId)
      .order('joined_at', { ascending: true }),
    sb
      .from('studio_invites')
      .select('id, email, role, invited_at, accepted_at, revoked_at')
      .eq('studio_id', ctx.studioId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('invited_at', { ascending: false }),
  ])

  const data: TeamData = {
    studio_id: ctx.studioId,
    my_role: ctx.role,
    members: (membersRes.data ?? []) as unknown as TeamData['members'],
    invites: (invitesRes.data ?? []) as unknown as TeamData['invites'],
  }

  return <TeamClient initialData={data} />
}
