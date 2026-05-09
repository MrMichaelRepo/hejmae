// /api/time-entries — list + create.
//
// Permission model:
//   - time:log is granted to every team role by default. Anyone can log
//     and see their own time.
//   - time:view_all (owner / admin) can see other members' entries.
//
// Without time:view_all, the route forces user_id to the caller's userId.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import { createTimeEntry } from '@/lib/validations/time_entry'
import { listTimeEntries, durationMinutes } from '@/lib/finances/time_entries'

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requirePermission(ctx, 'time:log')
    const url = new URL(req.url)

    const filter = {
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
      project_id: url.searchParams.get('project_id'),
      user_id: url.searchParams.get('user_id'),
      billable: url.searchParams.get('billable') === 'true'
        ? true
        : url.searchParams.get('billable') === 'false'
          ? false
          : null,
      unbilled_only: url.searchParams.get('unbilled') === 'true',
    }

    // Force user_id scoping when caller can't see others' entries.
    if (!hasPermission(ctx, 'time:view_all')) {
      filter.user_id = ctx.userId
    }

    const data = await listTimeEntries(ctx.designerId, filter)
    return NextResponse.json({ data })
  })
}

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requirePermission(ctx, 'time:log')
    const body = createTimeEntry.parse(await req.json())

    // Compute duration if both started+ended provided. Caller may also
    // pass duration_minutes for a backdated entry (e.g. "I worked 30
    // minutes yesterday"); we trust whichever is provided, prefer derived
    // when both ends are present.
    const computedDuration = durationMinutes(body.started_at, body.ended_at ?? null)
    const duration =
      computedDuration ?? body.duration_minutes ?? null

    // Snapshot the rate from the caller's default if not provided.
    let rate = body.hourly_rate_cents ?? null
    if (rate == null) {
      const { data: u } = await supabaseAdmin()
        .from('users')
        .select('default_hourly_rate_cents')
        .eq('id', ctx.userId)
        .maybeSingle()
      rate = (u?.default_hourly_rate_cents as number | undefined) ?? 0
    }

    const insert = {
      designer_id: ctx.designerId,
      user_id: ctx.userId,
      project_id: body.project_id,
      description: body.description,
      started_at: body.started_at,
      ended_at: body.ended_at ?? null,
      duration_minutes: duration,
      hourly_rate_cents: rate,
      billable: body.billable,
      notes: body.notes ?? null,
    }

    const { data, error } = await supabaseAdmin()
      .from('time_entries')
      .insert(insert)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ data }, { status: 201 })
  })
}
