// GET — list the studio's payment processor connections and which one is
// currently active. Used by the Settings → Payments page to render the
// two-card UI.
import { NextResponse } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import { listProcessorAccounts } from '@/lib/payments/provider'

export async function GET() {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const sb = supabaseAdmin()
    const [{ data: userRow, error: userErr }, accounts] = await Promise.all([
      sb
        .from('users')
        .select('active_payment_processor')
        .eq('id', designerId)
        .single(),
      listProcessorAccounts(designerId),
    ])
    if (userErr) throw userErr
    return NextResponse.json({
      active_processor: userRow.active_payment_processor,
      accounts: accounts.map((a) => ({
        processor: a.processor,
        status: a.status,
        external_account_id: a.externalAccountId,
        // Never expose secrets / API tokens.
        config_keys: Object.keys(a.config ?? {}),
      })),
    })
  })
}
