// /api/finances/ledger — paginated journal view.
//
// Returns the most recent journal entries with their balanced lines and
// the account info needed to render them. Optional filters:
//   ?account_id=  — only entries that touch this account
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD
//   ?source_type=expense|mileage|payment|manual
//   ?limit= (default 100, max 500)

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const url = new URL(req.url)
    const accountId = url.searchParams.get('account_id')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const sourceType = url.searchParams.get('source_type')
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 1),
      500,
    )

    const sb = supabaseAdmin()

    // If filtering by account, narrow to entries that touch that account.
    let entryIds: string[] | null = null
    if (accountId) {
      const { data, error } = await sb
        .from('journal_lines')
        .select('entry_id')
        .eq('designer_id', designerId)
        .eq('account_id', accountId)
      if (error) throw error
      entryIds = Array.from(new Set((data ?? []).map((r) => r.entry_id)))
      if (entryIds.length === 0) {
        return NextResponse.json({ data: { entries: [], accounts: [] } })
      }
    }

    let q = sb
      .from('journal_entries')
      .select('*')
      .eq('designer_id', designerId)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (entryIds) q = q.in('id', entryIds)
    if (from) q = q.gte('entry_date', from)
    if (to) q = q.lte('entry_date', to)
    if (sourceType) q = q.eq('source_type', sourceType)

    const { data: entries, error } = await q
    if (error) throw error

    const ids = (entries ?? []).map((e) => e.id)
    const lines = ids.length
      ? (
          await sb
            .from('journal_lines')
            .select('*')
            .eq('designer_id', designerId)
            .in('entry_id', ids)
            .order('position', { ascending: true })
        ).data ?? []
      : []

    // Pull all accounts once — there are at most a couple dozen per
    // designer, so this is cheaper than per-line joins.
    const { data: accounts, error: aErr } = await sb
      .from('accounts')
      .select('id, code, name, type, system_key')
      .eq('designer_id', designerId)
    if (aErr) throw aErr

    return NextResponse.json({
      data: {
        entries: (entries ?? []).map((e) => ({
          ...e,
          lines: lines.filter((l) => l.entry_id === e.id),
        })),
        accounts: accounts ?? [],
      },
    })
  })
}
