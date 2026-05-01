// Server-side Supabase clients.
//
// We expose two flavors:
//   * supabaseAdmin() — service-role client. Bypasses RLS. Use ONLY from
//     server code (API routes, server actions, webhook handlers) and ONLY
//     after validating ownership in code.
//   * supabaseAsDesigner(jwt) — anon-key client carrying a Clerk-issued JWT
//     in Authorization. RLS applies. Useful when we want belt-and-suspenders
//     enforcement, but most API routes use the admin client + explicit
//     designer_id checks.
//
// Never import this file from a client component.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

let _admin: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient {
  if (_admin) return _admin
  _admin = createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'X-Client-Info': 'hejmae-server' } },
  })
  return _admin
}

export function supabaseAsDesigner(clerkJwt: string): SupabaseClient {
  return createClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${clerkJwt}`,
        'X-Client-Info': 'hejmae-server-rls',
      },
    },
  })
}
