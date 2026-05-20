// /api/finances/period-locks
//
// GET  → list locks (latest first).
// POST → create a new lock: { locked_through_date, reason? }. Owner-only.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireDesigner } from '@/lib/auth/designer'
import { requireRole } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'

const dateRe = /^\d{4}-\d{2}-\d{2}$/
const createSchema = z.object({
  locked_through_date: z.string().regex(dateRe),
  reason: z.string().max(500).nullable().optional(),
})

export async function GET() {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const { data, error } = await supabaseAdmin()
      .from('period_locks')
      .select('*')
      .eq('designer_id', designerId)
      .order('locked_through_date', { ascending: false })
    if (error) throw error
    return NextResponse.json({ data })
  })
}

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requireRole(ctx, 'owner')
    const body = createSchema.parse(await req.json())
    const { data, error } = await supabaseAdmin()
      .from('period_locks')
      .insert({
        designer_id: ctx.designerId,
        locked_through_date: body.locked_through_date,
        reason: body.reason ?? null,
        locked_by_user_id: ctx.userId,
      })
      .select('*')
      .single()
    if (error) throw error
    return NextResponse.json({ data }, { status: 201 })
  })
}
