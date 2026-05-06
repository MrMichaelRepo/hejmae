// /api/vendors — list + create.
//
// Vendor records are designer-scoped. The unique constraint
// (designer_id, lower(name)) means a duplicate-name insert returns 23505;
// we surface that as a friendly 409 instead of a generic 500.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, conflict } from '@/lib/errors'
import { createVendor } from '@/lib/validations/vendor'

export async function GET() {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const { data, error } = await supabaseAdmin()
      .from('vendors')
      .select('*')
      .eq('designer_id', designerId)
      .order('name', { ascending: true })
    if (error) throw error
    return NextResponse.json({ data })
  })
}

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const body = createVendor.parse(await req.json())
    const { data, error } = await supabaseAdmin()
      .from('vendors')
      .insert({ designer_id: designerId, ...body })
      .select()
      .single()
    if (error) {
      if (error.code === '23505') {
        throw conflict('A vendor with that name already exists')
      }
      throw error
    }
    return NextResponse.json({ data }, { status: 201 })
  })
}
