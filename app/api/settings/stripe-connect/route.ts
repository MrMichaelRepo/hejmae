// Initiate Stripe Connect onboarding for the current studio. Returns a
// one-time onboarding URL. Routes through the multi-processor abstraction
// so the new payment_processor_accounts row stays in sync with whatever
// account Stripe assigns.
import { NextResponse } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requireRole } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, serverError } from '@/lib/errors'
import { stripeProvider } from '@/lib/payments/stripe'

export async function POST() {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requireRole(ctx, 'owner')
    const { designerId } = ctx

    // Stripe Connect is studio-level — load the owner's row, not the caller's.
    const sb = supabaseAdmin()
    const { data: ownerRow, error: ownerErr } = await sb
      .from('users')
      .select('email')
      .eq('id', designerId)
      .single()
    if (ownerErr) throw ownerErr

    const result = await stripeProvider.initOnboarding({
      designerId,
      email: ownerRow.email,
    })
    if (result.kind !== 'redirect' || !result.url) {
      throw serverError('Stripe onboarding did not return a redirect URL')
    }
    return NextResponse.json({ onboarding_url: result.url })
  })
}
