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
  // Supabase
  supabaseUrl: () => required('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: () => required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: () => required('SUPABASE_SERVICE_ROLE_KEY'),

  // Clerk
  clerkSecretKey: () => required('CLERK_SECRET_KEY'),
  clerkWebhookSecret: () => required('CLERK_WEBHOOK_SECRET'),

  // Stripe (platform account)
  stripeSecretKey: () => required('STRIPE_SECRET_KEY'),
  stripeWebhookSecret: () => required('STRIPE_WEBHOOK_SECRET'),
  stripeConnectWebhookSecret: () => required('STRIPE_CONNECT_WEBHOOK_SECRET'),

  // Platform config
  appUrl: () => required('NEXT_PUBLIC_APP_URL'),
  platformFeeBps: () => Number(optional('PLATFORM_FEE_BPS') ?? '10'), // 0.1% = 10 bps
}
