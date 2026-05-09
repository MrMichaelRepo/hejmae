// Toggle reconciliation status on a single expense.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound } from '@/lib/errors'
import { reconcileExpense } from '@/lib/validations/expense'

interface Ctx {
  params: Promise<{ expenseId: string }>
}

export async function POST(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { expenseId } = await params
    const ctx = await requireDesigner()
    requirePermission(ctx, 'finances:record_payments')
    const body = reconcileExpense.parse(await req.json())

    const sb = supabaseAdmin()
    const { data: existing, error: loadErr } = await sb
      .from('expenses')
      .select('id, designer_id')
      .eq('id', expenseId)
      .eq('designer_id', ctx.designerId)
      .maybeSingle()
    if (loadErr) throw loadErr
    if (!existing) throw notFound('Expense not found')

    const update = body.reconciled
      ? {
          reconciled_at: new Date().toISOString(),
          reconciled_by_user_id: ctx.userId,
        }
      : {
          reconciled_at: null,
          reconciled_by_user_id: null,
        }

    const { data, error } = await sb
      .from('expenses')
      .update(update)
      .eq('id', expenseId)
      .eq('designer_id', ctx.designerId)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ data })
  })
}
