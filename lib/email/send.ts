// Centralized transactional email sender.
//
// Designed to soft-fail: if RESEND_API_KEY is unset, we log and return
// without throwing — the rest of the workflow still completes. This keeps
// development / pre-launch installs from breaking when the email provider
// hasn't been configured yet.

import { Resend } from 'resend'
import { env } from '@/lib/env'

let _client: Resend | null = null
function client(): Resend | null {
  const key = env.resendApiKey()
  if (!key) return null
  if (!_client) _client = new Resend(key)
  return _client
}

export interface EmailMessage {
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
}

export async function sendEmail(msg: EmailMessage): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const c = client()
  if (!c) {
    console.warn('[email] RESEND_API_KEY not set — skipping send', {
      to: msg.to,
      subject: msg.subject,
    })
    return { ok: false, reason: 'no_api_key' }
  }
  try {
    const res = await c.emails.send({
      from: env.resendFromEmail(),
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      replyTo: msg.replyTo,
    })
    if (res.error) {
      console.error('[email] resend error', res.error)
      return { ok: false, reason: res.error.message }
    }
    return { ok: true, id: res.data?.id }
  } catch (err) {
    console.error('[email] failed', err)
    return { ok: false, reason: (err as Error).message }
  }
}
