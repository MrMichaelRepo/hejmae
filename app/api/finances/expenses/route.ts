// /api/finances/expenses — list + create.
//
// Creating an expense triggers a journal posting in the DB
// (post_expense_to_journal). Updates rebuild the lines; deletes cascade.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import { createExpense } from '@/lib/validations/expense'

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const url = new URL(req.url)
    const projectId = url.searchParams.get('project_id')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    let q = supabaseAdmin()
      .from('expenses')
      .select('*')
      .eq('designer_id', designerId)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (projectId) q = q.eq('project_id', projectId)
    if (from) q = q.gte('expense_date', from)
    if (to) q = q.lte('expense_date', to)

    const { data, error } = await q
    if (error) throw error
    return NextResponse.json({ data })
  })
}

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const body = createExpense.parse(await req.json())
    const { data, error } = await supabaseAdmin()
      .from('expenses')
      .insert({ designer_id: designerId, ...body })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ data }, { status: 201 })
  })
}
