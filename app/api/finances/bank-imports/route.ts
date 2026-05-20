// /api/finances/bank-imports
//
// GET  → list recent imports.
// POST → upload + parse a CSV. multipart/form-data:
//          file:        CSV
//          source:      'chase'|'bofa'|'amex'|'generic' (optional; auto-detected)
//          account_id:  hejmae chart-of-accounts row this statement covers (optional)
//
// On POST we parse synchronously and insert all bank_transactions, then
// fire-and-forget the AI matching pass. The client can poll the import
// row's `status` field.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, badRequest } from '@/lib/errors'
import { parseBankCsv } from '@/lib/banking/csv-parse'
import { runMatchingPass } from '@/lib/banking/ai-match'
import type { BankImportSource } from '@/lib/supabase/types'

const SOURCES: BankImportSource[] = ['chase', 'bofa', 'amex', 'generic']

export async function GET() {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const { data, error } = await supabaseAdmin()
      .from('bank_statement_imports')
      .select('*')
      .eq('designer_id', designerId)
      .order('uploaded_at', { ascending: false })
      .limit(100)
    if (error) throw error
    return NextResponse.json({ data })
  })
}

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const form = await req.formData()
    const file = form.get('file')
    if (!file || typeof file === 'string') {
      throw badRequest('file is required')
    }
    const sourceRaw = (form.get('source') as string) || ''
    const hint = SOURCES.includes(sourceRaw as BankImportSource)
      ? (sourceRaw as BankImportSource)
      : undefined
    const accountId = (form.get('account_id') as string) || null

    const text = await (file as File).text()
    const parsed = parseBankCsv(text, hint)
    if (parsed.rows.length === 0) {
      throw badRequest('No transactions found in file. Check the format / try a different bank.')
    }

    const sb = supabaseAdmin()
    const { data: importRow, error: insErr } = await sb
      .from('bank_statement_imports')
      .insert({
        designer_id: designerId,
        account_id: accountId,
        source: parsed.source,
        filename: (file as File).name || 'upload.csv',
        period_start: parsed.periodStart,
        period_end: parsed.periodEnd,
        row_count: parsed.rows.length,
        status: 'parsed',
      })
      .select('*')
      .single()
    if (insErr) throw insErr

    const { error: txnErr } = await sb.from('bank_transactions').insert(
      parsed.rows.map((r) => ({
        designer_id: designerId,
        import_id: importRow.id,
        txn_date: r.txn_date,
        description: r.description,
        amount_cents: r.amount_cents,
        balance_cents: r.balance_cents,
      })),
    )
    if (txnErr) throw txnErr

    // Fire-and-forget AI matching.
    void runMatchingPass(designerId, importRow.id).catch((e) => {
      console.error('[banking] background matching failed', e)
    })

    return NextResponse.json({ data: importRow }, { status: 201 })
  })
}
