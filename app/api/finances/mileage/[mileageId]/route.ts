// /api/finances/mileage/[mileageId] — read / update / delete.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound } from '@/lib/errors'
import { updateMileage } from '@/lib/validations/mileage'

interface Ctx {
  params: Promise<{ mileageId: string }>
}

async function loadTrip(designerId: string, id: string) {
  const { data, error } = await supabaseAdmin()
    .from('mileage_log')
    .select('*')
    .eq('id', id)
    .eq('designer_id', designerId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw notFound('Mileage trip not found')
  return data
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { mileageId } = await params
    const { designerId } = await requireDesigner()
    const trip = await loadTrip(designerId, mileageId)
    return NextResponse.json({ data: trip })
  })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { mileageId } = await params
    const { designerId } = await requireDesigner()
    await loadTrip(designerId, mileageId)
    const body = updateMileage.parse(await req.json())
    const { data, error } = await supabaseAdmin()
      .from('mileage_log')
      .update(body)
      .eq('id', mileageId)
      .eq('designer_id', designerId)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ data })
  })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { mileageId } = await params
    const { designerId } = await requireDesigner()
    await loadTrip(designerId, mileageId)
    const { error } = await supabaseAdmin()
      .from('mileage_log')
      .delete()
      .eq('id', mileageId)
      .eq('designer_id', designerId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  })
}
