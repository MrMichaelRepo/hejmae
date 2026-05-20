// Studio-level finance settings: accounting basis, fiscal year start,
// estimated tax rates. Owner-only (the studio head sets policy).

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound } from '@/lib/errors'
import { updateStudioFinance } from '@/lib/validations/studio_finance'

export async function GET() {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requirePermission(ctx, 'finances:view')
    const { data, error } = await supabaseAdmin()
      .from('studios')
      .select(
        'id, name, owner_user_id, accounting_basis, fiscal_year_start_month, estimated_federal_tax_pct, estimated_state_tax_pct, estimated_self_employment_tax_pct, tax_state_code, default_invoice_email_mode, default_sales_tax_rate_bps, default_sales_tax_state_code',
      )
      .eq('id', ctx.studioId)
      .maybeSingle()
    if (error) throw error
    if (!data) throw notFound('Studio not found')
    return NextResponse.json({ data })
  })
}

export async function PATCH(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requirePermission(ctx, 'finances:manage_settings')
    const body = updateStudioFinance.parse(await req.json())
    const { data, error } = await supabaseAdmin()
      .from('studios')
      .update(body)
      .eq('id', ctx.studioId)
      .select(
        'id, name, owner_user_id, accounting_basis, fiscal_year_start_month, estimated_federal_tax_pct, estimated_state_tax_pct, estimated_self_employment_tax_pct, tax_state_code, default_invoice_email_mode, default_sales_tax_rate_bps, default_sales_tax_state_code',
      )
      .single()
    if (error) throw error
    return NextResponse.json({ data })
  })
}
