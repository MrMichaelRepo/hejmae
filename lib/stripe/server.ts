// Platform Stripe client. All Connect operations are performed by passing
// `stripeAccount: <connected_account_id>` on individual calls.
import Stripe from 'stripe'
import { env } from '@/lib/env'

let _stripe: Stripe | null = null

export function stripe(): Stripe {
  if (_stripe) return _stripe
  // Omit apiVersion → SDK uses its bundled LatestApiVersion. The Stripe
  // dashboard pin still wins for the account, so this is safe.
  _stripe = new Stripe(env.stripeSecretKey(), {
    typescript: true,
    appInfo: { name: 'hejmae', version: '0.1.0' },
  })
  return _stripe
}
