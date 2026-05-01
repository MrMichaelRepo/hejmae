// /api/projects — list + create
import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, badRequest } from '@/lib/errors'
import { createProject } from '@/lib/validations/project'

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const sp = req.nextUrl.searchParams
    const status = sp.get('status')
    const clientId = sp.get('client_id')

    let q = supabaseAdmin()
      .from('projects')
      .select('*')
      .eq('designer_id', designerId)
      .order('created_at', { ascending: false })

    if (status) q = q.eq('status', status)
    if (clientId) q = q.eq('client_id', clientId)

    const { data, error } = await q
    if (error) throw error
    return NextResponse.json({ data })
  })
}

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const { designerId, user } = await requireDesigner()
    const body = createProject.parse(await req.json())

    if (body.client_id) {
      // Belt-and-suspenders: ensure the client belongs to this designer.
      const { data: client } = await supabaseAdmin()
        .from('clients')
        .select('id')
        .eq('id', body.client_id)
        .eq('designer_id', designerId)
        .maybeSingle()
      if (!client) throw badRequest('client_id does not belong to this designer')
    }

    const { data, error } = await supabaseAdmin()
      .from('projects')
      .insert({
        designer_id: designerId,
        client_id: body.client_id ?? null,
        name: body.name,
        status: body.status ?? 'active',
        budget_cents: body.budget_cents ?? null,
        location: body.location ?? null,
        notes: body.notes ?? null,
        floor_plan_url: body.floor_plan_url ?? null,
        // Inherit pricing config from the studio default if unspecified.
        pricing_mode: body.pricing_mode ?? user.pricing_mode,
        markup_percent: body.markup_percent ?? user.default_markup_percent,
      })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ data }, { status: 201 })
  })
}
