// User actions on bank_transactions: accept the AI proposal, reject it,
// ignore the row, or create a fresh expense from it.
//
// Actions update bank_transactions.status and (for accept / create-expense)
// set matched_entity_type + matched_entity_id so the txn is hard-linked
// going forward. Re-running the AI matcher won't overwrite a non-pending
// status.

import { supabaseAdmin } from '@/lib/supabase/server'
import type { BankTransactionRow } from '@/lib/supabase/types'

async function loadTxn(
  designerId: string,
  txnId: string,
): Promise<BankTransactionRow> {
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from('bank_transactions')
    .select('*')
    .eq('id', txnId)
    .eq('designer_id', designerId)
    .single()
  if (error) throw error
  return data as BankTransactionRow
}

export async function acceptProposal(
  designerId: string,
  txnId: string,
  userId: string,
): Promise<void> {
  const txn = await loadTxn(designerId, txnId)
  if (!txn.proposed_entity_type || !txn.proposed_entity_id) {
    throw new Error('No proposal to accept on this transaction.')
  }
  const sb = supabaseAdmin()
  const { error } = await sb
    .from('bank_transactions')
    .update({
      status: 'matched',
      matched_entity_type: txn.proposed_entity_type,
      matched_entity_id: txn.proposed_entity_id,
      acted_at: new Date().toISOString(),
      acted_by_user_id: userId,
    })
    .eq('id', txnId)
    .eq('designer_id', designerId)
  if (error) throw error
  // Also mark the source expense as reconciled. We don't touch payments —
  // those flow through the invoice's reconciliation surface.
  if (txn.proposed_entity_type === 'expense') {
    await sb
      .from('expenses')
      .update({
        reconciled_at: new Date().toISOString(),
        reconciled_by_user_id: userId,
      })
      .eq('id', txn.proposed_entity_id)
      .eq('designer_id', designerId)
  }
}

export async function rejectProposal(
  designerId: string,
  txnId: string,
  userId: string,
): Promise<void> {
  const sb = supabaseAdmin()
  const { error } = await sb
    .from('bank_transactions')
    .update({
      proposed_entity_type: null,
      proposed_entity_id: null,
      proposed_confidence: null,
      proposed_reasoning: null,
      acted_at: new Date().toISOString(),
      acted_by_user_id: userId,
    })
    .eq('id', txnId)
    .eq('designer_id', designerId)
  if (error) throw error
}

export async function ignoreTxn(
  designerId: string,
  txnId: string,
  userId: string,
): Promise<void> {
  const sb = supabaseAdmin()
  const { error } = await sb
    .from('bank_transactions')
    .update({
      status: 'ignored',
      acted_at: new Date().toISOString(),
      acted_by_user_id: userId,
    })
    .eq('id', txnId)
    .eq('designer_id', designerId)
  if (error) throw error
}

export interface CreateExpenseInput {
  category_account_id: string
  payment_account_id: string
  vendor_id?: string | null
  notes?: string | null
}

// Create a fresh expense from a bank txn (when the AI didn't find a match
// because the expense doesn't exist in hejmae yet).
export async function createExpenseFromTxn(
  designerId: string,
  txnId: string,
  userId: string,
  input: CreateExpenseInput,
): Promise<{ expenseId: string }> {
  const txn = await loadTxn(designerId, txnId)
  if (txn.amount_cents >= 0) {
    throw new Error('Only outflow (negative) transactions can become expenses.')
  }
  const sb = supabaseAdmin()
  const { data: expense, error: insErr } = await sb
    .from('expenses')
    .insert({
      designer_id: designerId,
      project_id: null,
      category_account_id: input.category_account_id,
      payment_account_id: input.payment_account_id,
      vendor_id: input.vendor_id ?? null,
      expense_date: txn.txn_date,
      amount_cents: Math.abs(txn.amount_cents),
      description: txn.description,
      notes: input.notes ?? null,
      reconciled_at: new Date().toISOString(),
      reconciled_by_user_id: userId,
    })
    .select('id')
    .single()
  if (insErr) throw insErr
  const { error: upErr } = await sb
    .from('bank_transactions')
    .update({
      status: 'created_expense',
      matched_entity_type: 'expense',
      matched_entity_id: expense.id,
      acted_at: new Date().toISOString(),
      acted_by_user_id: userId,
    })
    .eq('id', txnId)
    .eq('designer_id', designerId)
  if (upErr) throw upErr
  return { expenseId: expense.id }
}
