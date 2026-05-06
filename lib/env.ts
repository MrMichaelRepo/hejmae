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

  // Resend (transactional email). Optional — sends are no-ops if missing.
  resendApiKey: () => optional('RESEND_API_KEY'),
  resendFromEmail: () =>
    optional('RESEND_FROM_EMAIL') ?? 'hejmae <hello@hejmae.com>',

  // Anthropic — used for vision-based floor-plan auto-straightening.
  // Optional: if missing, uploads still get tier-1 normalization (resize +
  // EXIF auto-orient + WebP) but skip the AI corner-detect/crop step.
  anthropicApiKey: () => optional('ANTHROPIC_API_KEY'),
  // Default on; set to '0' / 'false' to disable per-deployment.
  floorPlanAutoStraighten: () => {
    const v = optional('FLOOR_PLAN_AUTO_STRAIGHTEN')
    if (v == null) return true
    return !['0', 'false', 'no', 'off'].includes(v.toLowerCase())
  },

  // Platform config
  appUrl: () => required('NEXT_PUBLIC_APP_URL'),
  platformFeeBps: () => Number(optional('PLATFORM_FEE_BPS') ?? '10'), // 0.1% = 10 bps
}
