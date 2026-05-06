// /api/vendors/[vendorId] — read / update / delete.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound, conflict } from '@/lib/errors'
import { updateVendor } from '@/lib/validations/vendor'

interface Ctx {
  params: Promise<{ vendorId: string }>
}

async function loadVendor(designerId: string, vendorId: string) {
  const { data, error } = await supabaseAdmin()
    .from('vendors')
    .select('*')
    .eq('id', vendorId)
    .eq('designer_id', designerId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw notFound('Vendor not found')
  return data
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { vendorId } = await params
    const { designerId } = await requireDesigner()
    const vendor = await loadVendor(designerId, vendorId)
    return NextResponse.json({ data: vendor })
  })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { vendorId } = await params
    const { designerId } = await requireDesigner()
    await loadVendor(designerId, vendorId)
    const body = updateVendor.parse(await req.json())
    const { data, error } = await supabaseAdmin()
      .from('vendors')
      .update(body)
      .eq('id', vendorId)
      .eq('designer_id', designerId)
      .select()
      .single()
    if (error) {
      if (error.code === '23505') {
        throw conflict('A vendor with that name already exists')
      }
      throw error
    }
    return NextResponse.json({ data })
  })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { vendorId } = await params
    const { designerId } = await requireDesigner()
    await loadVendor(designerId, vendorId)
    // Hard-delete: vendor records carry no historical financial state
    // (POs and items snapshot the vendor name as a string at creation
    // time). Removing a vendor record only affects future auto-populate.
    const { error } = await supabaseAdmin()
      .from('vendors')
      .delete()
      .eq('id', vendorId)
      .eq('designer_id', designerId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  })
}
