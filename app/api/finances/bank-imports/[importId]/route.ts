// /api/finances/bank-imports/[importId]
//
// GET    → import row + transactions + proposed-entity details inline.
// DELETE → drop the import and its transactions (FK cascade).

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound } from '@/lib/errors'

interface Ctx {
  params: Promise<{ importId: string }>
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { importId } = await params
    const { designerId } = await requireDesigner()
    const sb = supabaseAdmin()

    const { data: importRow, error: impErr } = await sb
      .from('bank_statement_imports')
      .select('*')
      .eq('id', importId)
      .eq('designer_id', designerId)
      .maybeSingle()
    if (impErr) throw impErr
    if (!importRow) throw notFound('Import not found')

    const { data: txns, error: txnErr } = await sb
      .from('bank_transactions')
      .select('*')
      .eq('designer_id', designerId)
      .eq('import_id', importId)
      .order('txn_date', { ascending: true })
      .order('created_at', { ascending: true })
    if (txnErr) throw txnErr

    // Inline lookups for proposed expenses + payments so the UI doesn't
    // need a per-row roundtrip.
    const proposedExpenseIds = new Set<string>()
    const proposedPaymentIds = new Set<string>()
    for (const t of txns ?? []) {
      const row = t as { proposed_entity_type: string | null; proposed_entity_id: string | null }
      if (row.proposed_entity_type === 'expense' && row.proposed_entity_id) {
        proposedExpenseIds.add(row.proposed_entity_id)
      } else if (row.proposed_entity_type === 'payment' && row.proposed_entity_id) {
        proposedPaymentIds.add(row.proposed_entity_id)
      }
    }

    const [expRes, payRes] = await Promise.all([
      proposedExpenseIds.size > 0
        ? sb
            .from('expenses')
            .select('id, expense_date, vendor_name, description, amount_cents')
            .in('id', Array.from(proposedExpenseIds))
        : Promise.resolve({ data: [] as unknown[], error: null }),
      proposedPaymentIds.size > 0
        ? sb
            .from('payments')
            .select('id, received_at, amount_cents, invoice_id')
            .in('id', Array.from(proposedPaymentIds))
        : Promise.resolve({ data: [] as unknown[], error: null }),
    ])
    if (expRes.error) throw expRes.error
    if (payRes.error) throw payRes.error

    return NextResponse.json({
      data: {
        import: importRow,
        transactions: txns ?? [],
        proposed: {
          expenses: expRes.data ?? [],
          payments: payRes.data ?? [],
        },
      },
    })
  })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { importId } = await params
    const { designerId } = await requireDesigner()
    const sb = supabaseAdmin()
    const { error } = await sb
      .from('bank_statement_imports')
      .delete()
      .eq('id', importId)
      .eq('designer_id', designerId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  })
}
