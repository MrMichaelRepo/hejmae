import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound } from '@/lib/errors'
import { updateClient } from '@/lib/validations/client'

interface Ctx {
  params: Promise<{ clientId: string }>
}

async function loadClient(designerId: string, clientId: string) {
  const { data, error } = await supabaseAdmin()
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .eq('designer_id', designerId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw notFound('Client not found')
  return data
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { clientId } = await params
    const { designerId } = await requireDesigner()
    const client = await loadClient(designerId, clientId)
    return NextResponse.json({ data: client })
  })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { clientId } = await params
    const { designerId } = await requireDesigner()
    await loadClient(designerId, clientId)
    const body = updateClient.parse(await req.json())
    const { data, error } = await supabaseAdmin()
      .from('clients')
      .update(body)
      .eq('id', clientId)
      .eq('designer_id', designerId)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ data })
  })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { clientId } = await params
    const { designerId } = await requireDesigner()
    await loadClient(designerId, clientId)
    const { error } = await supabaseAdmin()
      .from('clients')
      .delete()
      .eq('id', clientId)
      .eq('designer_id', designerId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  })
}
