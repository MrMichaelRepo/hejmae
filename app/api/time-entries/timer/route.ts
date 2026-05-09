// /api/time-entries/timer
//
// GET  → returns the caller's currently-running timer, if any.
// POST → starts a new timer. If a running timer already exists, stops it
//        first (so the user can switch tasks without leaving an open one).

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import { startTimer } from '@/lib/validations/time_entry'
import { getRunningTimer, durationMinutes } from '@/lib/finances/time_entries'

export async function GET() {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requirePermission(ctx, 'time:log')
    const running = await getRunningTimer(ctx.designerId, ctx.userId)
    return NextResponse.json({ data: running })
  })
}

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requirePermission(ctx, 'time:log')
    const body = startTimer.parse(await req.json())
    const sb = supabaseAdmin()

    // Stop any open timer for this user first.
    const running = await getRunningTimer(ctx.designerId, ctx.userId)
    if (running) {
      const now = new Date().toISOString()
      await sb
        .from('time_entries')
        .update({
          ended_at: now,
          duration_minutes: durationMinutes(running.started_at, now),
        })
        .eq('id', running.id)
    }

    // Snapshot rate.
    const { data: u } = await sb
      .from('users')
      .select('default_hourly_rate_cents')
      .eq('id', ctx.userId)
      .maybeSingle()
    const rate = (u?.default_hourly_rate_cents as number | undefined) ?? 0

    const { data, error } = await sb
      .from('time_entries')
      .insert({
        designer_id: ctx.designerId,
        user_id: ctx.userId,
        project_id: body.project_id,
        description: body.description,
        started_at: new Date().toISOString(),
        ended_at: null,
        duration_minutes: null,
        hourly_rate_cents: rate,
        billable: body.billable,
      })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ data }, { status: 201 })
  })
}
