// Initiate Stripe Connect onboarding. Creates an Express account if the
// designer doesn't have one yet and returns a one-time onboarding URL.
import { NextResponse } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import { createConnectAccount, createOnboardingLink } from '@/lib/stripe/connect'

export async function POST() {
  return withErrorHandling(async () => {
    const { designerId, user } = await requireDesigner()

    let accountId = user.stripe_account_id
    if (!accountId) {
      const account = await createConnectAccount({
        email: user.email,
        designerId,
      })
      accountId = account.id
      await supabaseAdmin()
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
