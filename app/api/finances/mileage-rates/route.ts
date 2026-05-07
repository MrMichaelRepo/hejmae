// /api/finances/mileage-rates — list + upsert per-year mileage rates.
//
// The seed migration populates 2024–2026 with the IRS standard rates;
// designers can override here if they're tracking actuals at a different
// number, or as future years come online.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import { upsertMileageRate } from '@/lib/validations/mileage'

export async function GET() {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const { data, error } = await supabaseAdmin()
      .from('mileage_rates')
      .select('*')
      .eq('designer_id', designerId)
      .order('year', { ascending: false })
    if (error) throw error
    return NextResponse.json({ data })
  })
}

// PUT semantics: upsert by (designer_id, year). House style prefers
// upserts over inserts so a designer editing the 2026 rate twice in a
// session never collides with the unique index.
export async function PUT(req: NextRequest) {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const body = upsertMileageRate.parse(await req.json())
    const { data, error } = await supabaseAdmin()
      .from('mileage_rates')
      .upsert(
        { designer_id: designerId, ...body },
        { onConflict: 'designer_id,year' },
      )
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ data }, { status: 201 })
  })
}
