// Set "I tied this account to the bank statement through X" on an account.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound } from '@/lib/errors'
import { reconcileAccount } from '@/lib/validations/expense'

interface Ctx {
  params: Promise<{ accountId: string }>
}

export async function POST(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { accountId } = await params
    const ctx = await requireDesigner()
    requirePermission(ctx, 'finances:record_payments')
    const body = reconcileAccount.parse(await req.json())

    const sb = supabaseAdmin()
    const { data: existing, error: loadErr } = await sb
      .from('accounts')
      .select('id')
      .eq('id', accountId)
      .eq('designer_id', ctx.designerId)
      .maybeSingle()
    if (loadErr) throw loadErr
    if (!existing) throw notFound('Account not found')

    const update = body.through_date
      ? {
          last_reconciled_through_date: body.through_date,
          last_reconciled_at: new Date().toISOString(),
          last_reconciled_by_user_id: ctx.userId,
        }
      : {
          last_reconciled_through_date: null,
          last_reconciled_at: null,
          last_reconciled_by_user_id: null,
        }

    const { data, error } = await sb
      .from('accounts')
      .update(update)
      .eq('id', accountId)
      .eq('designer_id', ctx.designerId)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ data })
  })
}
