// Shared types for the multi-processor payments layer.

export type ProcessorName = 'stripe' | 'helcim'

export type ProcessorStatus = 'pending' | 'active' | 'disabled'

export interface ProcessorAccount {
  id: string
  designerId: string
  processor: ProcessorName
  status: ProcessorStatus
  externalAccountId: string
  config: Record<string, unknown>
}

// What the client portal / dashboard needs to mount the right SDK and
// confirm a payment. The shape is intentionally generic — Stripe returns
// `clientToken = client_secret`, Helcim returns the HelcimPay checkout token.
export interface InitPaymentResult {
  processor: ProcessorName
  externalAccountId: string
  // Stable handle for this in-flight payment attempt. For Stripe this is
  // the PaymentIntent id (pi_...), for Helcim the checkout/invoice id.
  paymentRef: string
  // Opaque token the browser SDK uses to complete the payment.
  clientToken: string
}

export interface RefundResult {
  id: string
  status: string
}

export interface RefundOpts {
  // The processor-specific charge identifier we recorded at payment time
  // (Stripe charge id, Helcim transaction id).
  chargeId: string
  account: ProcessorAccount
  amountCents?: number
  reason?: string
  metadata?: Record<string, string>
}

export interface InitPaymentOpts {
  invoiceId: string
  designerId: string
  totalCents: number
  account: ProcessorAccount
  existingPaymentRef?: string | null
  customerEmail?: string | null
}

export interface OnboardingResult {
  // 'redirect' = send the user to a hosted onboarding URL (Stripe Connect).
  // 'manual'   = the UI collects API credentials in-app (Helcim today —
  //              they don't expose a Connect-style hosted onboarding flow).
  kind: 'redirect' | 'manual'
  url?: string
  instructions?: string
}

export interface PaymentProvider {
  readonly name: ProcessorName

  // Returns either a redirect URL or the marker that the UI should render
  // a credential-entry form.
  initOnboarding(opts: {
    designerId: string
    email: string
  }): Promise<OnboardingResult>

  // Idempotent in spirit — callers may invoke repeatedly while the client
  // sits on the portal page; we reuse an existing in-flight ref when possible.
  initInvoicePayment(opts: InitPaymentOpts): Promise<InitPaymentResult>

  refund(opts: RefundOpts): Promise<RefundResult>
}
