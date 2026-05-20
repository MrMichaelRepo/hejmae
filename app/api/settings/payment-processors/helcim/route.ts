// Helcim credential entry & disconnect.
//
// POST { api_token, account_id, webhook_verifier? } — store credentials and
// mark the account 'active'. Helcim doesn't expose a Connect-style hosted
// onboarding flow, so the designer signs up at helcim.com, gets approved,
// then pastes credentials here.
//
// API tokens are encrypted at rest via lib/payments/secrets.ts (AES-256-GCM
// with the platform PAYMENT_SECRET_KEY) and stored in the secrets table —
// not in payment_processor_accounts.config.
//
// DELETE — disconnect Helcim. Removes encrypted secrets + the account row.
// If it was active, also clears users.active_payment_processor.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireDesigner } from '@/lib/auth/designer'
import { requireRole } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, badRequest, serverError } from '@/lib/errors'
import {
  PaymentSecretsConfigError,
  setProcessorSecret,
} from '@/lib/payments/secrets'

const credentialSchema = z.object({
  api_token: z.string().trim().min(8, 'API token looks too short').max(500),
  account_id: z.string().trim().min(1).max(100),
  // Optional during onboarding — the designer creates the webhook subscription
  // separately in their Helcim dashboard once they have hejmae's webhook URL.
  // Required at signature-verification time, so flag the gap clearly in the UI.
  webhook_verifier: z.string().trim().min(8).max(500).optional().nullable(),
})

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requireRole(ctx, 'owner')
    const { designerId } = ctx

    const parsed = credentialSchema.safeParse(await req.json())
    if (!parsed.success) {
      throw badRequest(
        'Invalid Helcim credentials',
        parsed.error.flatten().fieldErrors,
      )
    }

    const sb = supabaseAdmin()
    // Upsert the account row first so we have an id for the secrets table.
    const { data: account, error: upsertErr } = await sb
      .from('payment_processor_accounts')
      .upsert(
        {
          designer_id: designerId,
          processor: 'helcim',
          status: 'active',
          external_account_id: parsed.data.account_id,
          // config is reserved for non-secret pointers (e.g. last 4 of token
          // for UI display in the future). Never store api_token here.
          config: {},
        },
        { onConflict: 'designer_id,processor' },
      )
      .select('id')
      .single()
    if (upsertErr) throw upsertErr

    try {
      await setProcessorSecret(account.id, 'api_token', parsed.data.api_token)
      if (parsed.data.webhook_verifier) {
        await setProcessorSecret(
          account.id,
          'webhook_verifier',
          parsed.data.webhook_verifier,
        )
      }
    } catch (err) {
      if (err instanceof PaymentSecretsConfigError) {
        // Roll back the account row so the studio doesn't end up in a
        // half-onboarded state (account 'active' but no usable token).
        await sb.from('payment_processor_accounts').delete().eq('id', account.id)
        throw serverError(err.message)
      }
      throw err
    }

    return NextResponse.json({
      ok: true,
      webhook_verifier_set: Boolean(parsed.data.webhook_verifier),
    })
  })
}

export async function DELETE() {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requireRole(ctx, 'owner')
    const { designerId } = ctx

    const sb = supabaseAdmin()
    // ON DELETE CASCADE on payment_processor_secrets.account_id cleans up
    // the encrypted blobs automatically.
    const { error: delErr } = await sb
      .from('payment_processor_accounts')
      .delete()
      .eq('designer_id', designerId)
      .eq('processor', 'helcim')
    if (delErr) throw delErr

    const { data: userRow } = await sb
      .from('users')
      .select('active_payment_processor')
      .eq('id', designerId)
      .maybeSingle()
    if (userRow?.active_payment_processor === 'helcim') {
      await sb
        .from('users')
        .update({ active_payment_processor: null })
        .eq('id', designerId)
    }

    return NextResponse.json({ ok: true })
  })
}
