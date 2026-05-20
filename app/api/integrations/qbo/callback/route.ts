// OAuth callback from Intuit.
//
// Intuit appends ?code=…&state=…&realmId=… (or error=…&error_description=…).
// We verify the state HMAC against the currently-signed-in designer,
// exchange the code for tokens, encrypt and persist them, then bounce the
// user back to /dashboard/settings with a status flag.

import { NextRequest, NextResponse } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { env } from '@/lib/env'
import {
  exchangeCodeForTokens,
  isQboConfigured,
  qboConfig,
  verifyState,
} from '@/lib/qbo/oauth'
import { upsertConnection } from '@/lib/qbo/connection'

function redirectWith(status: string, detail?: string): NextResponse {
  const url = new URL('/dashboard/settings', env.appUrl())
  url.searchParams.set('qbo', status)
  if (detail) url.searchParams.set('qbo_detail', detail)
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  if (!isQboConfigured()) {
    return redirectWith('error', 'not_configured')
  }

  const sp = req.nextUrl.searchParams
  const error = sp.get('error')
  if (error) {
    return redirectWith('error', sp.get('error_description') ?? error)
  }

  const code = sp.get('code')
  const state = sp.get('state')
  const realmId = sp.get('realmId')
  if (!code || !state || !realmId) {
    return redirectWith('error', 'missing_params')
  }

  const verified = verifyState(state)
  if (!verified) {
    return redirectWith('error', 'invalid_state')
  }

  // The user must still be signed in as the same designer who started the
  // flow. If they signed out / switched accounts mid-handshake, abort.
  let ctx
  try {
    ctx = await requireDesigner()
  } catch {
    return redirectWith('error', 'not_signed_in')
  }
  if (ctx.designerId !== verified.designerId) {
    return redirectWith('error', 'designer_mismatch')
  }

  let tokens
  try {
    tokens = await exchangeCodeForTokens(code)
  } catch (e) {
    console.error('[qbo] token exchange failed', e)
    return redirectWith('error', 'token_exchange_failed')
  }

  const now = Date.now()
  try {
    await upsertConnection({
      designerId: ctx.designerId,
      realmId,
      environment: qboConfig().environment,
      refreshToken: tokens.refreshToken,
      refreshTokenExpiresAt: new Date(now + tokens.refreshTokenExpiresInSec * 1000),
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: new Date(now + tokens.accessTokenExpiresInSec * 1000),
      scopes: null,
    })
  } catch (e) {
    console.error('[qbo] persist failed', e)
    return redirectWith('error', 'persist_failed')
  }

  return redirectWith('connected')
}
