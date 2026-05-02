'use client'

// Stripe Elements payment form for the client portal.
//
// Mounted with a client_secret returned by /api/portal/invoices/[token]/payment-intent.
// The PaymentIntent lives on the designer's connected account, so Stripe.js
// is initialized with `stripeAccount: connectedAccountId`. Stripe redirects
// back to ?paid=1 on success — we re-fetch the invoice there to show
// "Paid" once the webhook flips the status.

import { useState } from 'react'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import type { StripeElementsOptions } from '@stripe/stripe-js'
import { getStripe } from '@/lib/stripe/client'
import Button from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'

export default function PaymentForm({
  clientSecret,
  connectedAccountId,
  brandColor,
  returnUrl,
}: {
  clientSecret: string
  connectedAccountId: string
  brandColor: string
  returnUrl: string
}) {
  const stripePromise = getStripe(connectedAccountId)

  const options: StripeElementsOptions = {
    clientSecret,
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: brandColor,
        colorBackground: '#eae8e0',
        colorText: '#1e2128',
        fontFamily: 'Times New Roman, serif',
        borderRadius: '2px',
      },
    },
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <Inner brandColor={brandColor} returnUrl={returnUrl} />
    </Elements>
  )
}

function Inner({
  brandColor,
  returnUrl,
}: {
  brandColor: string
  returnUrl: string
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    })
    if (error) {
      toast.error(error.message ?? 'Payment failed')
      setSubmitting(false)
    }
    // Success path: Stripe redirects to return_url. No further action needed
    // — the webhook flips invoice.status to paid.
  }

  return (
    <form onSubmit={submit}>
      <PaymentElement />
      <div className="mt-6">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={submitting}
          disabled={!stripe || !elements}
          style={{ background: brandColor, borderColor: brandColor }}
        >
          Pay invoice
        </Button>
      </div>
    </form>
  )
}
