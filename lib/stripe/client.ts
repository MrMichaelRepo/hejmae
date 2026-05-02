// Browser-side Stripe.js loader, Connect-aware.
//
// For direct charges on a designer's connected account, Stripe.js MUST be
// initialized with `stripeAccount: <connected_account_id>` so the
// PaymentIntent (which lives on the connected account) can be confirmed
// from the client. We cache one Promise per account id.

import { loadStripe, type Stripe } from '@stripe/stripe-js'

const cache = new Map<string, Promise<Stripe | null>>()

export function getStripe(connectedAccountId: string): Promise<Stripe | null> {
  const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  if (!pk) {
    return Promise.reject(
      new Error(
        'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set — set it in .env.local',
      ),
    )
  }
  const key = `${pk}::${connectedAccountId}`
  let p = cache.get(key)
  if (!p) {
    p = loadStripe(pk, { stripeAccount: connectedAccountId })
    cache.set(key, p)
  }
  return p
}
