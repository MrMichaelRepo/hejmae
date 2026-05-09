// Time-entry helpers shared between the API routes and server pages.

import { supabaseAdmin } from '@/lib/supabase/server'
import type { TimeEntryRow } from '@/lib/supabase/types'

export interface TimeEntryFilter {
  // ISO YYYY-MM-DD inclusive bounds against started_at::date.
  from?: string | null
  to?: string | null
  project_id?: string | null
  // When set, only return entries whose user_id matches. The team page
  // doesn't set this (admin sees everyone); the My Time page sets it to
  // ctx.userId.
  user_id?: string | null
  // Filter to billable / non-billable only.
  billable?: boolean | null
  // Only entries that have not been included on an invoice yet.
  unbilled_only?: boolean
}

export async function listTimeEntries(
  designerId: string,
  filter: TimeEntryFilter = {},
): Promise<TimeEntryRow[]> {
  let q = supabaseAdmin()
    .from('time_entries')
    .select('*')
    .eq('designer_id', designerId)
    .order('started_at', { ascending: false })
    .limit(2000)

  if (filter.from) q = q.gte('started_at', filter.from + 'T00:00:00.000Z')
  if (filter.to) q = q.lte('started_at', filter.to + 'T23:59:59.999Z')
  if (filter.project_id) q = q.eq('project_id', filter.project_id)
  if (filter.user_id) q = q.eq('user_id', filter.user_id)
  if (filter.billable === true) q = q.eq('billable', true)
  if (filter.billable === false) q = q.eq('billable', false)
  if (filter.unbilled_only) q = q.is('invoice_line_item_id', null)

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as TimeEntryRow[]
}

export async function getRunningTimer(
  designerId: string,
  userId: string,
): Promise<TimeEntryRow | null> {
  const { data, error } = await supabaseAdmin()
    .from('time_entries')
    .select('*')
    .eq('designer_id', designerId)
    .eq('user_id', userId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as TimeEntryRow | null
}

export function durationMinutes(
  started_at: string,
  ended_at: string | null,
): number | null {
  if (!ended_at) return null
  const ms = new Date(ended_at).getTime() - new Date(started_at).getTime()
  if (!Number.isFinite(ms) || ms < 0) return 0
  return Math.round(ms / 60_000)
}
