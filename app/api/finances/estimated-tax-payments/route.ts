// /api/finances/estimated-tax-payments — list + upsert quarterly payments.
//
// Upsert keyed on (designer_id, jurisdiction, tax_year, quarter) so the
// user can record an empty placeholder and update it later when paid.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import { upsertEstimatedTaxPayment } from '@/lib/validations/estimated_tax'

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requirePermission(ctx, 'finances:view')
    const url = new URL(req.url)
    const yr = url.searchParams.get('tax_year')

    let q = supabaseAdmin()
      .from('estimated_tax_payments')
      .select('*')
      .eq('designer_id', ctx.designerId)
      .order('tax_year', { ascending: false })
      .order('quarter', { ascending: true })
    if (yr) q = q.eq('tax_year', parseInt(yr, 10))
    const { data, error } = await q
    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  })
}

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requirePermission(ctx, 'finances:record_payments')
    const body = upsertEstimatedTaxPayment.parse(await req.json())
    const { data, error } = await supabaseAdmin()
      .from('estimated_tax_payments')
      .upsert(
        { designer_id: ctx.designerId, ...body },
        {
          onConflict: 'designer_id,jurisdiction,tax_year,quarter',
        },
      )
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ data })
  })
}
