// /api/finances/accounts — chart of accounts list.
//
// Read-only for now. The default COA is seeded automatically when a user
// first authenticates (via the trigger on public.users); the backfill in
// 20260506000001_bookkeeping.sql covers existing users. We still call the
// idempotent seed on read as a defensive guarantee — never returns an
// empty list to the dashboard for a freshly-signed-up designer who beat
// the trigger.

import { NextResponse } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'

export async function GET() {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const sb = supabaseAdmin()

    const { data, error } = await sb
      .from('accounts')
      .select('*')
      .eq('designer_id', designerId)
      .order('code', { ascending: true })
    if (error) throw error

    if (!data || data.length === 0) {
      // Defensive backfill — runs once for any designer the trigger missed.
      await sb.rpc('seed_default_chart_of_accounts', {
        p_designer_id: designerId,
      })
      const retry = await sb
        .from('accounts')
        .select('*')
        .eq('designer_id', designerId)
        .order('code', { ascending: true })
      if (retry.error) throw retry.error
      return NextResponse.json({ data: retry.data ?? [] })
    }

    return NextResponse.json({ data })
  })
}
