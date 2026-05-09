import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { listTimeEntries, getRunningTimer } from '@/lib/finances/time_entries'
import MyTimeClient from './MyTimeClient'
import type { ProjectRow, TimeEntryRow } from '@/lib/supabase/types'

export default async function MyTimePage() {
  const ctx = await requireDesigner()
  requirePermission(ctx, 'time:log')

  // Pull the last 90 days for the list / weekly grid; the client can
  // navigate weeks within that range.
  const today = new Date()
  const ninetyAgo = new Date(today.getTime() - 90 * 86_400_000)
  const fromIso = ninetyAgo.toISOString().slice(0, 10)

  const [entries, projectsRes, running, userRes] = await Promise.all([
    listTimeEntries(ctx.designerId, { user_id: ctx.userId, from: fromIso }),
    supabaseAdmin()
      .from('projects')
      .select('*')
      .eq('designer_id', ctx.designerId)
      .order('name', { ascending: true }),
    getRunningTimer(ctx.designerId, ctx.userId),
    supabaseAdmin()
      .from('users')
      .select('default_hourly_rate_cents, weekly_capacity_minutes')
      .eq('id', ctx.userId)
      .maybeSingle(),
  ])

  return (
    <MyTimeClient
      initialEntries={entries as TimeEntryRow[]}
      initialRunning={running as TimeEntryRow | null}
      projects={(projectsRes.data ?? []) as ProjectRow[]}
      defaultHourlyRateCents={(userRes.data?.default_hourly_rate_cents as number | undefined) ?? 0}
      weeklyCapacityMinutes={(userRes.data?.weekly_capacity_minutes as number | undefined) ?? 2400}
    />
  )
}
