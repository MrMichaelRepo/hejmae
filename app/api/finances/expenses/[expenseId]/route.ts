// /api/finances/expenses/[expenseId] — read / update / delete.
//
// Mutations re-run the post_expense_to_journal trigger so the journal
// stays in sync with whatever the user just edited. Delete cascades the
// journal entry via the BEFORE DELETE trigger.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound } from '@/lib/errors'
import { updateExpense } from '@/lib/validations/expense'
import { resolveAssetUrl } from '@/lib/storage'
import { trySyncExpense } from '@/lib/qbo/sync'
import { assertOwnsAccounts } from '@/lib/auth/ownership-accounts'

async function withSignedReceipt<T extends { receipt_path: string | null; receipt_url: string | null }>(
  row: T,
): Promise<T> {
  return {
    ...row,
    receipt_url: await resolveAssetUrl(row.receipt_path ?? row.receipt_url),
  }
}

interface Ctx {
  params: Promise<{ expenseId: string }>
}

async function loadExpense(designerId: string, expenseId: string) {
  const { data, error } = await supabaseAdmin()
    .from('expenses')
    .select('*')
    .eq('id', expenseId)
    .eq('designer_id', designerId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw notFound('Expense not found')
  return data
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { expenseId } = await params
    const { designerId } = await requireDesigner()
    const expense = await loadExpense(designerId, expenseId)
    return NextResponse.json({ data: await withSignedReceipt(expense) })
  })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { expenseId } = await params
    const { designerId } = await requireDesigner()
    await loadExpense(designerId, expenseId)
    const body = updateExpense.parse(await req.json())
    if (body.category_account_id || body.payment_account_id) {
      await assertOwnsAccounts(designerId, [
        body.category_account_id,
        body.payment_account_id,
      ])
    }
    // Drop receipt_url from writes — we always re-derive it from receipt_path.
    const { receipt_url: _ignore, ...persistable } = body
    const { data, error } = await supabaseAdmin()
      .from('expenses')
      .update(persistable)
      .eq('id', expenseId)
      .eq('designer_id', designerId)
      .select()
      .single()
    if (error) throw error
    trySyncExpense(designerId, expenseId)
    return NextResponse.json({ data: await withSignedReceipt(data) })
  })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { expenseId } = await params
    const { designerId } = await requireDesigner()
    await loadExpense(designerId, expenseId)
    const { error } = await supabaseAdmin()
      .from('expenses')
      .delete()
      .eq('id', expenseId)
      .eq('designer_id', designerId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  })
}
