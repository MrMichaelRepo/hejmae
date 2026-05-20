// /api/finances/expenses — list + create.
//
// Creating an expense triggers a journal posting in the DB
// (post_expense_to_journal). Updates rebuild the lines; deletes cascade.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import { createExpense } from '@/lib/validations/expense'
import { resolveAssetUrl, resolveAssetUrls } from '@/lib/storage'
import { trySyncExpense } from '@/lib/qbo/sync'
import { assertOwnsAccounts } from '@/lib/auth/ownership-accounts'

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
    // Replace any stored receipt_url with a fresh signed URL derived from
    // receipt_path. Old rows that have only receipt_url (legacy public URL)
    // pass through resolveAssetUrls which handles both shapes.
    const rows = data ?? []
    const signed = await resolveAssetUrls(
      rows.map((r) => r.receipt_path ?? r.receipt_url ?? null),
    )
    const out = rows.map((r, i) => ({ ...r, receipt_url: signed[i] }))
    return NextResponse.json({ data: out })
  })
}

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const body = createExpense.parse(await req.json())
    await assertOwnsAccounts(designerId, [
      body.category_account_id,
      body.payment_account_id,
    ])
    // Don't persist a stale signed/public URL into receipt_url; we always
    // re-sign from receipt_path on read.
    const { receipt_url: _ignore, ...persistable } = body
    const { data, error } = await supabaseAdmin()
      .from('expenses')
      .insert({ designer_id: designerId, ...persistable })
      .select()
      .single()
    if (error) throw error
    trySyncExpense(designerId, data.id)
    return NextResponse.json(
      {
        data: {
          ...data,
          receipt_url: await resolveAssetUrl(data.receipt_path ?? null),
        },
      },
      { status: 201 },
    )
  })
}
