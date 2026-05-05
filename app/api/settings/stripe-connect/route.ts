// Initiate Stripe Connect onboarding. Creates an Express account if the
// designer doesn't have one yet and returns a one-time onboarding URL.
import { NextResponse } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requireRole } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import { createConnectAccount, createOnboardingLink } from '@/lib/stripe/connect'

export async function POST() {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requireRole(ctx, 'owner')
    const { designerId } = ctx

    // Stripe Connect is studio-level — load the owner's row, not the caller's.
    const sb = supabaseAdmin()
    const { data: ownerRow, error: ownerErr } = await sb
      .from('users')
      .select('stripe_account_id, email')
      .eq('id', designerId)
      .single()
    if (ownerErr) throw ownerErr

    let accountId = ownerRow.stripe_account_id
    if (!accountId) {
      const account = await createConnectAccount({
        email: ownerRow.email,
        designerId,
      })
      accountId = account.id
      await sb
        .from('users')
        .update({ stripe_account_id: accountId })
        .eq('id', designerId)
    }

    const link = await createOnboardingLink({ accountId })
    return NextResponse.json({
      onboarding_url: link.url,
      account_id: accountId,
    })
  })
}
