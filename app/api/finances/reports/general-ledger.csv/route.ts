import { type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import { csvBody, csvResponse, csvRow, dollars } from '@/lib/finances/csv'

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requirePermission(ctx, 'finances:view')
    const url = new URL(req.url)
    const accountId = url.searchParams.get('account_id')
    const sourceType = url.searchParams.get('source_type')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    const sb = supabaseAdmin()

    let entryIds: string[] | null = null
    if (accountId) {
      const { data } = await sb
        .from('journal_lines')
        .select('entry_id')
        .eq('designer_id', ctx.designerId)
        .eq('account_id', accountId)
      entryIds = Array.from(new Set((data ?? []).map((r) => r.entry_id)))
      if (entryIds.length === 0) {
        return csvResponse('hejmae-general-ledger.csv', 'No entries\n')
      }
    }

    let q = sb
      .from('journal_entries')
      .select('id, entry_date, memo, source_type')
      .eq('designer_id', ctx.designerId)
      .order('entry_date', { ascending: true })
      .order('created_at', { ascending: true })
    if (entryIds) q = q.in('id', entryIds)
    if (from) q = q.gte('entry_date', from)
    if (to) q = q.lte('entry_date', to)
    if (sourceType) q = q.eq('source_type', sourceType)
    const { data: entries, error } = await q
    if (error) throw error

    const ids = (entries ?? []).map((e) => e.id)
    const { data: lines } = ids.length
      ? await sb
          .from('journal_lines')
          .select('*')
          .eq('designer_id', ctx.designerId)
          .in('entry_id', ids)
          .order('position', { ascending: true })
      : { data: [] }
    const { data: accounts } = await sb
      .from('accounts')
      .select('id, code, name')
      .eq('designer_id', ctx.designerId)
    const accIx = new Map((accounts ?? []).map((a) => [a.id, a]))

    const rows: string[] = []
    rows.push('General ledger')
    rows.push('')
    rows.push(
      csvRow([
        'Date',
        'Source',
        'Entry memo',
        'Account code',
        'Account',
        'Line memo',
        'Debit',
        'Credit',
      ]),
    )
    for (const e of entries ?? []) {
      const elines = (lines ?? []).filter((l) => l.entry_id === e.id)
      for (const l of elines) {
        const a = accIx.get(l.account_id)
        const debit = l.amount_cents > 0 ? l.amount_cents : 0
        const credit = l.amount_cents < 0 ? -l.amount_cents : 0
        rows.push(
          csvRow([
            e.entry_date,
            e.source_type,
            e.memo ?? '',
            a?.code ?? '',
            a?.name ?? '',
            l.memo ?? '',
            debit ? dollars(debit) : '',
            credit ? dollars(credit) : '',
          ]),
        )
      }
    }
    return csvResponse('hejmae-general-ledger.csv', csvBody(rows))
  })
}
