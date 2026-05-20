// Provider registry + lookup helpers. Routes call into here rather than
// importing a specific processor's module.
//
// The "active processor" is a per-designer setting (users.active_payment_processor).
// All in-flight payment / refund operations also pin the processor on
// invoices.processor at payment time so refunds always route correctly
// even if the designer toggles processors later.

import { supabaseAdmin } from '@/lib/supabase/server'
import { stripeProvider } from '@/lib/payments/stripe'
import { helcimProvider } from '@/lib/payments/helcim'
import type {
  PaymentProvider,
  ProcessorAccount,
  ProcessorName,
  ProcessorStatus,
} from '@/lib/payments/types'

const REGISTRY: Record<ProcessorName, PaymentProvider> = {
  stripe: stripeProvider,
  helcim: helcimProvider,
}

export function getProvider(name: ProcessorName): PaymentProvider {
  return REGISTRY[name]
}

export async function listProcessorAccounts(
  designerId: string,
): Promise<ProcessorAccount[]> {
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from('payment_processor_accounts')
    .select('id, designer_id, processor, status, external_account_id, config')
    .eq('designer_id', designerId)
  if (error) throw error
  return (data ?? []).map(toAccount)
}

export async function getProcessorAccount(
  designerId: string,
  processor: ProcessorName,
): Promise<ProcessorAccount | null> {
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from('payment_processor_accounts')
    .select('id, designer_id, processor, status, external_account_id, config')
    .eq('designer_id', designerId)
    .eq('processor', processor)
    .maybeSingle()
  if (error) throw error
  return data ? toAccount(data) : null
}

export async function getActiveProcessor(designerId: string): Promise<{
  provider: PaymentProvider
  account: ProcessorAccount
} | null> {
  const sb = supabaseAdmin()
  const { data: user, error } = await sb
    .from('users')
    .select('active_payment_processor')
    .eq('id', designerId)
    .maybeSingle()
  if (error) throw error
  const active = user?.active_payment_processor as ProcessorName | null
  if (!active) return null
  const account = await getProcessorAccount(designerId, active)
  if (!account || account.status !== 'active') return null
  return { provider: getProvider(active), account }
}

// Pin processor + payment-ref + external account on an invoice. Called
// every time we initialize or refresh a payment so refunds stay routable.
export async function recordInvoicePaymentInit(opts: {
  invoiceId: string
  designerId: string
  processor: ProcessorName
  paymentRef: string
  externalAccountId: string
}): Promise<void> {
  const sb = supabaseAdmin()
  const update: Record<string, unknown> = {
    processor: opts.processor,
    processor_payment_id: opts.paymentRef,
    processor_account_id: opts.externalAccountId,
  }
  // Legacy mirror so the existing Stripe webhook idempotency lookup (which
  // joins on invoices.stripe_payment_intent_id) keeps working until the
  // webhook is migrated. Helcim doesn't touch this column.
  if (opts.processor === 'stripe') {
    update.stripe_payment_intent_id = opts.paymentRef
    update.stripe_account_id = opts.externalAccountId
  }
  const { error } = await sb
    .from('invoices')
    .update(update)
    .eq('id', opts.invoiceId)
    .eq('designer_id', opts.designerId)
  if (error) throw error
}

interface RawAccountRow {
  id: string
  designer_id: string
  processor: string
  status: string
  external_account_id: string
  config: unknown
}

function toAccount(row: RawAccountRow): ProcessorAccount {
  return {
    id: row.id,
    designerId: row.designer_id,
    processor: row.processor as ProcessorName,
    status: row.status as ProcessorStatus,
    externalAccountId: row.external_account_id,
    config: (row.config ?? {}) as Record<string, unknown>,
  }
}
