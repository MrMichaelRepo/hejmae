import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { listTimeEntries } from '@/lib/finances/time_entries'
import TeamTimeClient from './TeamTimeClient'
import type { ProjectRow, TimeEntryRow } from '@/lib/supabase/types'

export default async function TeamTimePage() {
  const ctx = await requireDesigner()
  // Per design: studio owner + admins (or anyone with explicit permission)
  // can see team-wide time. Anyone else gets 403.
  requirePermission(ctx, 'time:view_all')

  const today = new Date()
  const ninetyAgo = new Date(today.getTime() - 90 * 86_400_000)
  const fromIso = ninetyAgo.toISOString().slice(0, 10)

  const [entries, projectsRes, membersRes] = await Promise.all([
    listTimeEntries(ctx.designerId, { from: fromIso }),
    supabaseAdmin()
      .from('projects')
      .select('*')
      .eq('designer_id', ctx.designerId)
      .order('name', { ascending: true }),
    supabaseAdmin()
      .from('studio_members')
      .select(
        'user_id, role, user:users!inner(id, name, email, weekly_capacity_minutes, default_hourly_rate_cents)',
      )
      .eq('studio_id', ctx.studioId),
  ])

  type RawMember = {
    user_id: string
    role: string
    user:
      | { id: string; name: string | null; email: string; weekly_capacity_minutes: number; default_hourly_rate_cents: number }
      | { id: string; name: string | null; email: string; weekly_capacity_minutes: number; default_hourly_rate_cents: number }[]
  }
  const members = ((membersRes.data ?? []) as unknown as RawMember[]).map((m) => {
    const u = Array.isArray(m.user) ? m.user[0] : m.user
    return {
      user_id: m.user_id,
      role: m.role,
      name: u.name,
      email: u.email,
      weekly_capacity_minutes: u.weekly_capacity_minutes,
      default_hourly_rate_cents: u.default_hourly_rate_cents,
    }
  })

  return (
    <TeamTimeClient
      initialEntries={entries as TimeEntryRow[]}
      projects={(projectsRes.data ?? []) as ProjectRow[]}
      members={members}
    />
  )
}
