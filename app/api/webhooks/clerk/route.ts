// Clerk webhook — keeps public.users in sync with Clerk identity events.
// Verified via Svix signatures.
import { NextResponse, type NextRequest } from 'next/server'
import { Webhook } from 'svix'
import { supabaseAdmin } from '@/lib/supabase/server'
import { env } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface ClerkUserEvent {
  type: 'user.created' | 'user.updated' | 'user.deleted' | string
  data: {
    id: string
    email_addresses?: Array<{ id: string; email_address: string }>
    primary_email_address_id?: string | null
    first_name?: string | null
    last_name?: string | null
  }
}

export async function POST(req: NextRequest) {
  const payload = await req.text()
  const headers = {
    'svix-id': req.headers.get('svix-id') ?? '',
    'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
    'svix-signature': req.headers.get('svix-signature') ?? '',
  }

  let evt: ClerkUserEvent
  try {
    const wh = new Webhook(env.clerkWebhookSecret())
    evt = wh.verify(payload, headers) as ClerkUserEvent
  } catch (err) {
    console.error('[clerk webhook] verification failed', err)
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  const sb = supabaseAdmin()
  switch (evt.type) {
    case 'user.created':
    case 'user.updated': {
      const primaryId = evt.data.primary_email_address_id
      const email =
        evt.data.email_addresses?.find((e) => e.id === primaryId)
          ?.email_address ??
        evt.data.email_addresses?.[0]?.email_address ??
        null
      if (!email) break
      const name =
        [evt.data.first_name, evt.data.last_name].filter(Boolean).join(' ') ||
        null
      await sb.from('users').upsert(
        {
          clerk_user_id: evt.data.id,
          email,
          name,
        },
        { onConflict: 'clerk_user_id' },
      )
      break
    }
    case 'user.deleted':
      // Hard-delete cascades to all owned rows. TODO: revisit — we may
      // want soft-delete to preserve invoice history.
      await sb.from('users').delete().eq('clerk_user_id', evt.data.id)
      break
    default:
      break
  }

  return NextResponse.json({ received: true })
}
