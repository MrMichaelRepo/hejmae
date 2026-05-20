// Centralized env access. Throws at boot if a required var is missing.
//
// Public (NEXT_PUBLIC_*) values are inlined by Next at build time; the rest
// must only be referenced from server code. Importing this file from a
// client component would expose the server vars as `undefined`, which is
// the desired failure mode.

function required(name: string): string {
  const v = process.env[name]
  if (!v || v.length === 0) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return v
}

function optional(name: string): string | undefined {
  const v = process.env[name]
  return v && v.length > 0 ? v : undefined
}

export const env = {
  // Supabase — using the new (2025) API key naming.
  //   * publishable_key (sb_publishable_…) → browser-safe; replaces "anon"
  //   * secret_key (sb_secret_…)            → server-only; replaces "service role"
  // The supabase-js client treats these as opaque strings, so legacy JWT
  // anon/service_role keys still work if pasted into the same slots.
  supabaseUrl: () => required('NEXT_PUBLIC_SUPABASE_URL'),
  supabasePublishableKey: () =>
    required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  supabaseSecretKey: () => required('SUPABASE_SECRET_KEY'),

  // Clerk
  clerkSecretKey: () => required('CLERK_SECRET_KEY'),
  clerkWebhookSecret: () => required('CLERK_WEBHOOK_SECRET'),

  // Stripe (platform account)
  stripeSecretKey: () => required('STRIPE_SECRET_KEY'),
  stripePublishableKey: () => optional('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
  stripeWebhookSecret: () => required('STRIPE_WEBHOOK_SECRET'),
  stripeConnectWebhookSecret: () => required('STRIPE_CONNECT_WEBHOOK_SECRET'),

  // Master key for encrypting payment-processor secrets at rest (Helcim API
  // tokens, per-merchant webhook verifier tokens). MUST be a 32-byte value
  // encoded as base64. Generate with: `openssl rand -base64 32`.
  // Required only when a designer connects Helcim — Stripe Connect doesn't
  // store long-lived credentials in our DB. If missing, Helcim onboarding
  // will return a clear error.
  paymentSecretKey: () => optional('PAYMENT_SECRET_KEY'),

  // Resend (transactional email). Optional — sends are no-ops if missing.
  resendApiKey: () => optional('RESEND_API_KEY'),
  resendFromEmail: () =>
    optional('RESEND_FROM_EMAIL') ?? 'hejmae <hello@hejmae.com>',

  // Anthropic — used for vision-based floor-plan auto-straightening.
  // Optional: if missing, uploads still get tier-1 normalization (resize +
  // EXIF auto-orient + WebP) but skip the AI corner-detect/crop step.
  anthropicApiKey: () => optional('ANTHROPIC_API_KEY'),

  // OpenAI — GPT-4o vision describes an uploaded image, and
  // text-embedding-3-small encodes that description + every catalog
  // product. Optional: if missing, /api/catalog/search/image returns a
  // clean 503 and embedding generation is a no-op, so the rest of the
  // app keeps working.
  openaiApiKey: () => optional('OPENAI_API_KEY'),

  // Platform config
  appUrl: () => required('NEXT_PUBLIC_APP_URL'),
  // Per-transaction platform fee on Stripe payments, in basis points.
  // Defaults to 0 — hejmae is priced as a flat-subscription SaaS, so we do
  // not take a cut of designer payment volume. The env var stays in place
  // so a deployment can opt into a fee (e.g. for an enterprise tier) without
  // a code change.
  platformFeeBps: () => Number(optional('PLATFORM_FEE_BPS') ?? '0'),

  // Upstash Redis for rate limiting. Optional — limiter no-ops without
  // these set, which is fine for local dev. Required in production.
  upstashRedisUrl: () => optional('UPSTASH_REDIS_REST_URL'),
  upstashRedisToken: () => optional('UPSTASH_REDIS_REST_TOKEN'),

  // Shared secret for scheduled jobs (Supabase pg_cron HTTP call into the
  // Next.js app). Required for any /api/cron/* route to accept a request.
  cronSecret: () => optional('CRON_SECRET'),

  // Address that the catalog-duplicate-scan summary email is sent to.
  // Falls back to the From address if unset.
  adminAlertEmail: () => optional('ADMIN_ALERT_EMAIL'),
}
