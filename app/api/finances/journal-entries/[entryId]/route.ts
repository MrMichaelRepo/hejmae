// /api/finances/journal-entries/[entryId] — delete a manual entry.
//
// Only manual entries are deletable via this route. Auto-posted entries
// (source_type in expense/mileage/payment) are owned by the source row;
// editing or removing them happens through the source endpoints, which
// trigger the cascade.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound, badRequest } from '@/lib/errors'

interface Ctx {
  params: Promise<{ entryId: string }>
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { entryId } = await params
    const { designerId } = await requireDesigner()
    const sb = supabaseAdmin()

    const { data: entry, error: loadErr } = await sb
      .from('journal_entries')
      .select('id, source_type')
      .eq('id', entryId)
      .eq('designer_id', designerId)
      .maybeSingle()
    if (loadErr) throw loadErr
    if (!entry) throw notFound('Entry not found')
    if (entry.source_type !== 'manual') {
      throw badRequest(
        'Auto-posted entries can only be removed by deleting the source ' +
          'expense, mileage trip, or payment.',
      )
    }

    // CASCADE drops journal_lines.
    const { error } = await sb
      .from('journal_entries')
      .delete()
      .eq('id', entryId)
      .eq('designer_id', designerId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  })
}
