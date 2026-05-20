// PATCH — set the studio's active payment processor. Only valid if that
// processor has an "active" payment_processor_accounts row.
//
// Invoices in flight (initialized PaymentIntent / HelcimPay session) keep
// their old processor pinned; the next portal payment-intent call after
// the toggle will issue a fresh session on the new processor.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireDesigner } from '@/lib/auth/designer'
import { requireRole } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, badRequest } from '@/lib/errors'
import { getProcessorAccount } from '@/lib/payments/provider'

const schema = z.object({
  processor: z.enum(['stripe', 'helcim']).nullable(),
})

export async function PATCH(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requireRole(ctx, 'owner')
    const { designerId } = ctx

    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      throw badRequest('Invalid payload', parsed.error.flatten().fieldErrors)
    }
    const next = parsed.data.processor

    if (next) {
      const account = await getProcessorAccount(designerId, next)
      if (!account || account.status !== 'active') {
        throw badRequest(
          `Cannot activate ${next}: account is not in 'active' state. Finish onboarding first.`,
        )
      }
    }

    const sb = supabaseAdmin()
    const { error } = await sb
      .from('users')
      .update({ active_payment_processor: next })
      .eq('id', designerId)
    if (error) throw error

    return NextResponse.json({ active_processor: next })
  })
}
