// Read / update / delete a time entry.
//
// Members can edit their own entries. Owners + time:view_all can edit anyone's.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound, forbidden } from '@/lib/errors'
import { updateTimeEntry } from '@/lib/validations/time_entry'
import { durationMinutes } from '@/lib/finances/time_entries'

interface Ctx {
  params: Promise<{ entryId: string }>
}

async function loadEntry(designerId: string, entryId: string) {
  const { data, error } = await supabaseAdmin()
    .from('time_entries')
    .select('*')
    .eq('id', entryId)
    .eq('designer_id', designerId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw notFound('Time entry not found')
  return data
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { entryId } = await params
    const ctx = await requireDesigner()
    requirePermission(ctx, 'time:log')
    const entry = await loadEntry(ctx.designerId, entryId)
    if (
      entry.user_id !== ctx.userId &&
      !hasPermission(ctx, 'time:view_all')
    ) {
      throw forbidden('You can only view your own time entries')
    }
    return NextResponse.json({ data: entry })
  })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { entryId } = await params
    const ctx = await requireDesigner()
    requirePermission(ctx, 'time:log')
    const entry = await loadEntry(ctx.designerId, entryId)
    if (
      entry.user_id !== ctx.userId &&
      !hasPermission(ctx, 'time:view_all')
    ) {
      throw forbidden('You can only edit your own time entries')
    }
    if (entry.invoice_line_item_id) {
      throw forbidden('This entry is on an invoice and cannot be edited')
    }

    const body = updateTimeEntry.parse(await req.json())

    // Stop = stamp ended_at to now and recompute duration.
    const update: Record<string, unknown> = { ...body }
    delete update.stop
    if (body.stop) {
      const now = new Date().toISOString()
      update.ended_at = now
      update.duration_minutes = durationMinutes(entry.started_at, now)
    } else if (body.started_at || body.ended_at !== undefined) {
      const newStart = body.started_at ?? entry.started_at
      const newEnd =
        body.ended_at === undefined ? entry.ended_at : body.ended_at ?? null
      update.started_at = newStart
      update.ended_at = newEnd
      const computed = durationMinutes(newStart, newEnd)
      update.duration_minutes = computed ?? body.duration_minutes ?? null
    }

    const { data, error } = await supabaseAdmin()
      .from('time_entries')
      .update(update)
      .eq('id', entryId)
      .eq('designer_id', ctx.designerId)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ data })
  })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { entryId } = await params
    const ctx = await requireDesigner()
    requirePermission(ctx, 'time:log')
    const entry = await loadEntry(ctx.designerId, entryId)
    if (
      entry.user_id !== ctx.userId &&
      !hasPermission(ctx, 'time:view_all')
    ) {
      throw forbidden('You can only delete your own time entries')
    }
    if (entry.invoice_line_item_id) {
      throw forbidden('This entry is on an invoice and cannot be deleted')
    }
    const { error } = await supabaseAdmin()
      .from('time_entries')
      .delete()
      .eq('id', entryId)
      .eq('designer_id', ctx.designerId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  })
}
