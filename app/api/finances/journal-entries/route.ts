// /api/finances/journal-entries — create a manual entry.
//
// Listing happens via /api/finances/ledger which already returns entries
// with their lines. POST here calls the create_manual_journal_entry RPC
// so the header + lines insert atomically and the deferred sum-to-zero
// trigger validates at commit time.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, badRequest } from '@/lib/errors'
import { createManualJournalEntry } from '@/lib/validations/journal'
import { trySyncJournalEntry } from '@/lib/qbo/sync'

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const body = createManualJournalEntry.parse(await req.json())

    const { data, error } = await supabaseAdmin().rpc(
      'create_manual_journal_entry',
      {
        p_designer_id: designerId,
        p_entry_date: body.entry_date,
        p_memo: body.memo ?? null,
        p_lines: body.lines.map((l) => ({
          account_id: l.account_id,
          amount_cents: l.amount_cents,
          project_id: l.project_id ?? null,
          memo: l.memo ?? null,
        })),
      },
    )
    if (error) {
      // Surface the deferred-balance and account-ownership exceptions as
      // 400s rather than 500s so the UI can show them inline.
      const msg = error.message || 'Failed to create entry'
      if (
        msg.includes('not balanced') ||
        msg.includes('does not belong') ||
        msg.includes('non-zero') ||
        msg.includes('at least 2 lines') ||
        msg.includes('not found')
      ) {
        throw badRequest(msg)
      }
      throw error
    }
    trySyncJournalEntry(designerId, data)
    return NextResponse.json({ data: { id: data } }, { status: 201 })
  })
}
