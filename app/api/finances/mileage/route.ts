// /api/finances/mileage — list + create mileage trips.
//
// On insert the DB triggers fill rate_cents_per_mile from the configured
// year rate (if not provided), compute amount_cents = round(miles * rate),
// and post a journal entry: DR Vehicle Expense, CR Owner's Equity.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import { createMileage } from '@/lib/validations/mileage'

// numeric(8,2) comes back from Supabase as a string. The list endpoint
// normalizes it to number so the UI can do arithmetic on `miles`.
function normalizeMiles<T extends { miles: unknown }>(row: T) {
  const m = row.miles
  if (typeof m === 'string') {
    const n = Number(m)
    return { ...row, miles: Number.isFinite(n) ? n : 0 }
  }
  return row
}

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const url = new URL(req.url)
    const projectId = url.searchParams.get('project_id')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    let q = supabaseAdmin()
      .from('mileage_log')
      .select('*')
      .eq('designer_id', designerId)
      .order('trip_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (projectId) q = q.eq('project_id', projectId)
    if (from) q = q.gte('trip_date', from)
    if (to) q = q.lte('trip_date', to)

    const { data, error } = await q
    if (error) throw error
    return NextResponse.json({ data: (data ?? []).map(normalizeMiles) })
  })
}

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const body = createMileage.parse(await req.json())
    const { data, error } = await supabaseAdmin()
      .from('mileage_log')
      .insert({
        designer_id: designerId,
        // Sentinel 0 → trigger fills from mileage_rates.
        rate_cents_per_mile: body.rate_cents_per_mile ?? 0,
        // amount_cents is recomputed by trigger; pass 0.
        amount_cents: 0,
        ...body,
      })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ data: normalizeMiles(data) }, { status: 201 })
  })
}
