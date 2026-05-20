// Opening-balance journal entry from QBO's Trial Balance report.
//
// On the cutover date, the studio runs this once to land every hejmae
// account at the same balance QB has on that date. The result is a single
// manual JE whose lines sum to zero (accounting identity guarantees it).
//
// Flow:
//   1. Call QBO's /reports/TrialBalance?end_date=<cutoverDate>
//   2. For each row, look up the qbo→hejmae account mapping.
//   3. Build JE lines: debit balance → positive amount_cents, credit
//      balance → negative.
//   4. Call create_manual_journal_entry RPC.
//
// Skipping rules:
//   * Rows whose QBO account isn't mapped to a hejmae account are reported
//     as warnings but do not block — caller can decide whether to proceed.
//     (If you proceed with unmapped rows, the JE will fail the sum-to-zero
//     check; we surface that error.)
//   * Zero-balance rows are dropped.

import { qboFetch } from '@/lib/qbo/client'
import { supabaseAdmin } from '@/lib/supabase/server'

// QBO reports return a hierarchical structure: Rows.Row[] where each Row
// may be either a Header/Summary (no ColData) or a Data row with ColData
// entries. The column order matches Columns.Column[]. For TrialBalance
// the columns are: account_name, debit, credit.

interface ReportColData {
  value?: string
  id?: string
}

interface ReportRow {
  type?: 'Data' | 'Section'
  group?: string
  ColData?: ReportColData[]
  Rows?: { Row?: ReportRow[] }
  Summary?: { ColData?: ReportColData[] }
}

interface RawTrialBalanceReport {
  Header?: { Time?: string; StartPeriod?: string; EndPeriod?: string }
  Columns?: { Column?: Array<{ ColTitle?: string; ColType?: string }> }
  Rows?: { Row?: ReportRow[] }
}

interface TbRow {
  qboAccountId: string
  qboAccountName: string
  debit: number
  credit: number
}

function flattenReport(report: RawTrialBalanceReport): TbRow[] {
  const out: TbRow[] = []
  function walk(rows: ReportRow[] | undefined) {
    if (!rows) return
    for (const r of rows) {
      if (r.ColData && r.ColData.length >= 3) {
        const accountCol = r.ColData[0]
        const debitCol = r.ColData[1]
        const creditCol = r.ColData[2]
        if (accountCol?.id) {
          const debit = parseFloat(debitCol?.value ?? '') || 0
          const credit = parseFloat(creditCol?.value ?? '') || 0
          if (debit !== 0 || credit !== 0) {
            out.push({
              qboAccountId: accountCol.id,
              qboAccountName: accountCol.value ?? '',
              debit,
              credit,
            })
          }
        }
      }
      walk(r.Rows?.Row)
    }
  }
  walk(report.Rows?.Row)
  return out
}

async function fetchTrialBalance(
  designerId: string,
  cutoverDate: string,
): Promise<TbRow[]> {
  const report = (await qboFetch(designerId, 'reports/TrialBalance', {
    query: { end_date: cutoverDate, summarize_column_by: 'Total' },
  })) as RawTrialBalanceReport
  return flattenReport(report)
}

export interface TrialBalancePreviewRow {
  qboAccountId: string
  qboAccountName: string
  debit: number
  credit: number
  hejmaeAccountId: string | null
  hejmaeAccountMapped: boolean
}

export interface TrialBalancePreview {
  cutoverDate: string
  rows: TrialBalancePreviewRow[]
  unmappedCount: number
  totalDebit: number
  totalCredit: number
  balanced: boolean
}

export async function previewTrialBalance(
  designerId: string,
  cutoverDate: string,
): Promise<TrialBalancePreview> {
  const sb = supabaseAdmin()
  const [tb, refsRes] = await Promise.all([
    fetchTrialBalance(designerId, cutoverDate),
    sb
      .from('qbo_external_refs')
      .select('hejmae_id, qbo_id')
      .eq('designer_id', designerId)
      .eq('entity_type', 'account'),
  ])
  if (refsRes.error) throw refsRes.error
  const byQboId = new Map<string, string>()
  for (const r of refsRes.data ?? []) {
    byQboId.set(
      (r as { qbo_id: string }).qbo_id,
      (r as { hejmae_id: string }).hejmae_id,
    )
  }
  const rows: TrialBalancePreviewRow[] = tb.map((r) => ({
    qboAccountId: r.qboAccountId,
    qboAccountName: r.qboAccountName,
    debit: r.debit,
    credit: r.credit,
    hejmaeAccountId: byQboId.get(r.qboAccountId) ?? null,
    hejmaeAccountMapped: byQboId.has(r.qboAccountId),
  }))
  const totalDebit = rows.reduce((a, r) => a + r.debit, 0)
  const totalCredit = rows.reduce((a, r) => a + r.credit, 0)
  return {
    cutoverDate,
    rows,
    unmappedCount: rows.filter((r) => !r.hejmaeAccountMapped).length,
    totalDebit,
    totalCredit,
    balanced: Math.abs(totalDebit - totalCredit) < 0.01,
  }
}

export interface TrialBalanceApplyResult {
  journalEntryId: string
  lineCount: number
}

export async function applyTrialBalance(
  designerId: string,
  cutoverDate: string,
): Promise<TrialBalanceApplyResult> {
  const preview = await previewTrialBalance(designerId, cutoverDate)
  if (!preview.balanced) {
    throw new Error(
      `QBO trial balance is not balanced (debits=${preview.totalDebit.toFixed(2)}, credits=${preview.totalCredit.toFixed(2)}). Re-run when QB itself balances.`,
    )
  }
  if (preview.unmappedCount > 0) {
    throw new Error(
      `${preview.unmappedCount} QBO account(s) have no hejmae mapping. Map them on the chart-of-accounts page first.`,
    )
  }

  // amount_cents: positive = debit, negative = credit.
  const lines = preview.rows
    .map((r) => {
      const cents = Math.round((r.debit - r.credit) * 100)
      return {
        account_id: r.hejmaeAccountId,
        amount_cents: cents,
        memo: `Opening balance for ${r.qboAccountName}`,
      }
    })
    .filter((l) => l.amount_cents !== 0)

  if (lines.length < 2) {
    throw new Error('Need at least two non-zero lines to post the opening JE.')
  }

  const sb = supabaseAdmin()
  const { data, error } = await sb.rpc('create_manual_journal_entry', {
    p_designer_id: designerId,
    p_entry_date: cutoverDate,
    p_memo: `Opening balances imported from QuickBooks as of ${cutoverDate}`,
    p_lines: lines,
  })
  if (error) throw error
  return { journalEntryId: data, lineCount: lines.length }
}

