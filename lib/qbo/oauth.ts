// Intuit OAuth 2.0 helpers.
//
// Flow:
//   1. POST /api/integrations/qbo/connect → returns Intuit authorize URL with
//      a signed `state` token binding the request to the current designer.
//   2. User authorizes in QuickBooks; Intuit redirects back to /callback
//      with ?code=…&state=…&realmId=…
//   3. /callback verifies the state HMAC, exchanges the code for tokens,
//      and writes an encrypted qbo_connections row.
//
// Tokens (per Intuit docs as of 2025):
//   * access_token  — Bearer, ~1 hour TTL.
//   * refresh_token — rotates on every refresh; ~100 days TTL.
//
// State signing uses HMAC-SHA256 over `${designerId}.${expiry}.${nonce}`
// keyed by PAYMENT_SECRET_KEY. Stateless — no DB write to begin a connect.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/env'
import type { QboEnvironment } from '@/lib/supabase/types'

// Accounting-only scope. We don't need com.intuit.quickbooks.payment.
export const QBO_SCOPE = 'com.intuit.quickbooks.accounting'

const AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2'
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens'
const REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke'

// State expires fast — the user has to complete the Intuit consent flow
// inside this window. 10 minutes is plenty.
const STATE_TTL_MS = 10 * 60 * 1000

export class QboNotConfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QboNotConfiguredError'
  }
}

export interface QboOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  environment: QboEnvironment
}

export function qboConfig(): QboOAuthConfig {
  const clientId = env.qboClientId()
  const clientSecret = env.qboClientSecret()
  if (!clientId || !clientSecret) {
    throw new QboNotConfiguredError(
      'QBO_CLIENT_ID and QBO_CLIENT_SECRET must be set to use the QuickBooks integration.',
    )
  }
  const redirectUri =
    env.qboRedirectUri() ?? `${env.appUrl()}/api/integrations/qbo/callback`
  return {
    clientId,
    clientSecret,
    redirectUri,
    environment: env.qboEnvironment(),
  }
}

export function isQboConfigured(): boolean {
  return !!(env.qboClientId() && env.qboClientSecret())
}

// ---------------------------------------------------------------------------
// State signing
// ---------------------------------------------------------------------------

function stateKey(): Buffer {
  const raw = env.paymentSecretKey()
  if (!raw) {
    throw new QboNotConfiguredError(
      'PAYMENT_SECRET_KEY must be set — QBO state tokens are HMAC-signed with it.',
    )
  }
  return Buffer.from(raw, 'base64')
}

export function signState(designerId: string): string {
  const expiry = Date.now() + STATE_TTL_MS
  const nonce = randomBytes(12).toString('base64url')
  const payload = `${designerId}.${expiry}.${nonce}`
  const sig = createHmac('sha256', stateKey()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export interface VerifiedState {
  designerId: string
  expiry: number
}

export function verifyState(state: string): VerifiedState | null {
  const parts = state.split('.')
  if (parts.length !== 4) return null
  const [designerId, expiryStr, nonce, sig] = parts
  const payload = `${designerId}.${expiryStr}.${nonce}`
  const expected = createHmac('sha256', stateKey()).update(payload).digest('base64url')
  const given = Buffer.from(sig, 'base64url')
  const want = Buffer.from(expected, 'base64url')
  if (given.length !== want.length) return null
  if (!timingSafeEqual(given, want)) return null
  const expiry = Number(expiryStr)
  if (!Number.isFinite(expiry) || expiry < Date.now()) return null
  return { designerId, expiry }
}

// ---------------------------------------------------------------------------
// Authorize URL
// ---------------------------------------------------------------------------

export function buildAuthorizeUrl(state: string): string {
  const cfg = qboConfig()
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    scope: QBO_SCOPE,
    redirect_uri: cfg.redirectUri,
    state,
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

// ---------------------------------------------------------------------------
// Token exchange + refresh
// ---------------------------------------------------------------------------

export interface QboTokenResponse {
  accessToken: string
  refreshToken: string
  accessTokenExpiresInSec: number
  refreshTokenExpiresInSec: number
  tokenType: string
}

interface RawTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  x_refresh_token_expires_in: number
  token_type: string
}

function basicAuthHeader(cfg: QboOAuthConfig): string {
  return (
    'Basic ' + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')
  )
}

async function tokenRequest(body: URLSearchParams): Promise<QboTokenResponse> {
  const cfg = qboConfig()
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(cfg),
    },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`QBO token request failed (${res.status}): ${text}`)
  }
  const json = (await res.json()) as RawTokenResponse
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    accessTokenExpiresInSec: json.expires_in,
    refreshTokenExpiresInSec: json.x_refresh_token_expires_in,
    tokenType: json.token_type,
  }
}

export function exchangeCodeForTokens(code: string): Promise<QboTokenResponse> {
  const cfg = qboConfig()
  return tokenRequest(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: cfg.redirectUri,
    }),
  )
}

export function refreshAccessToken(refreshToken: string): Promise<QboTokenResponse> {
  return tokenRequest(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  )
}

export async function revokeToken(token: string): Promise<void> {
  const cfg = qboConfig()
  const res = await fetch(REVOKE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: basicAuthHeader(cfg),
    },
    body: JSON.stringify({ token }),
  })
  // Intuit returns 200 on success, 400 on already-revoked. Either is fine
  // for our purposes — the studio wants the connection gone.
  if (!res.ok && res.status !== 400) {
    const text = await res.text()
    throw new Error(`QBO revoke failed (${res.status}): ${text}`)
  }
}

// ---------------------------------------------------------------------------
// API base URL per environment
// ---------------------------------------------------------------------------

export function qboApiBase(environment: QboEnvironment): string {
  return environment === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com'
}
