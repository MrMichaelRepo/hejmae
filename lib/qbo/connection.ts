// CRUD for qbo_connections, plus the token-bag accessor that the API client
// uses to fetch a current access token (refreshing transparently when stale).

import { supabaseAdmin } from '@/lib/supabase/server'
import type {
  QboConnectionRow,
  QboConnectionStatus,
  QboEnvironment,
} from '@/lib/supabase/types'
import {
  bytesForDb,
  bytesFromDb,
  decryptToken,
  encryptToken,
  type EncryptedBlob,
} from '@/lib/qbo/secrets'
import { refreshAccessToken } from '@/lib/qbo/oauth'

// Refresh proactively a minute before Intuit's stated expiry to avoid a
// race where the token expires mid-flight.
const REFRESH_LEEWAY_MS = 60_000

interface FullConnectionRow {
  id: string
  designer_id: string
  realm_id: string
  environment: QboEnvironment
  status: QboConnectionStatus
  refresh_token_ct: unknown
  refresh_token_iv: unknown
  refresh_token_tag: unknown
  refresh_token_expires_at: string | null
  access_token_ct: unknown
  access_token_iv: unknown
  access_token_tag: unknown
  access_token_expires_at: string | null
  scopes: string | null
  connected_at: string
  last_refreshed_at: string | null
  created_at: string
  updated_at: string
}

function toPublic(row: FullConnectionRow): QboConnectionRow {
  return {
    id: row.id,
    designer_id: row.designer_id,
    realm_id: row.realm_id,
    environment: row.environment,
    status: row.status,
    refresh_token_expires_at: row.refresh_token_expires_at,
    access_token_expires_at: row.access_token_expires_at,
    scopes: row.scopes,
    connected_at: row.connected_at,
    last_refreshed_at: row.last_refreshed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function blob(ct: unknown, iv: unknown, tag: unknown): EncryptedBlob {
  return {
    ciphertext: bytesFromDb(ct),
    iv: bytesFromDb(iv),
    authTag: bytesFromDb(tag),
  }
}

export async function getConnection(
  designerId: string,
): Promise<QboConnectionRow | null> {
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from('qbo_connections')
    .select(
      'id, designer_id, realm_id, environment, status, refresh_token_expires_at, access_token_expires_at, scopes, connected_at, last_refreshed_at, created_at, updated_at',
    )
    .eq('designer_id', designerId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return data as QboConnectionRow
}

export interface UpsertConnectionInput {
  designerId: string
  realmId: string
  environment: QboEnvironment
  refreshToken: string
  refreshTokenExpiresAt: Date
  accessToken: string
  accessTokenExpiresAt: Date
  scopes: string | null
}

export async function upsertConnection(input: UpsertConnectionInput): Promise<void> {
  const sb = supabaseAdmin()
  const rt = encryptToken(input.refreshToken)
  const at = encryptToken(input.accessToken)
  const { error } = await sb.from('qbo_connections').upsert(
    {
      designer_id: input.designerId,
      realm_id: input.realmId,
      environment: input.environment,
      status: 'active',
      refresh_token_ct: bytesForDb(rt.ciphertext),
      refresh_token_iv: bytesForDb(rt.iv),
      refresh_token_tag: bytesForDb(rt.authTag),
      refresh_token_expires_at: input.refreshTokenExpiresAt.toISOString(),
      access_token_ct: bytesForDb(at.ciphertext),
      access_token_iv: bytesForDb(at.iv),
      access_token_tag: bytesForDb(at.authTag),
      access_token_expires_at: input.accessTokenExpiresAt.toISOString(),
      scopes: input.scopes,
      connected_at: new Date().toISOString(),
      last_refreshed_at: new Date().toISOString(),
    },
    { onConflict: 'designer_id' },
  )
  if (error) throw error
}

export async function deleteConnection(designerId: string): Promise<string | null> {
  // Return the decrypted refresh token so the caller can revoke it with
  // Intuit before we forget it.
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from('qbo_connections')
    .select('refresh_token_ct, refresh_token_iv, refresh_token_tag')
    .eq('designer_id', designerId)
    .maybeSingle()
  if (error) throw error
  let refreshToken: string | null = null
  if (data) {
    refreshToken = decryptToken(
      blob(data.refresh_token_ct, data.refresh_token_iv, data.refresh_token_tag),
    )
  }
  const { error: delErr } = await sb
    .from('qbo_connections')
    .delete()
    .eq('designer_id', designerId)
  if (delErr) throw delErr
  return refreshToken
}

export async function markStatus(
  designerId: string,
  status: QboConnectionStatus,
): Promise<void> {
  const sb = supabaseAdmin()
  const { error } = await sb
    .from('qbo_connections')
    .update({ status })
    .eq('designer_id', designerId)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Access-token accessor with auto-refresh.
// ---------------------------------------------------------------------------

export interface ActiveToken {
  accessToken: string
  realmId: string
  environment: QboEnvironment
}

export async function getActiveAccessToken(
  designerId: string,
): Promise<ActiveToken | null> {
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from('qbo_connections')
    .select('*')
    .eq('designer_id', designerId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as FullConnectionRow
  if (row.status !== 'active') return null

  const accessExpiry = row.access_token_expires_at
    ? new Date(row.access_token_expires_at).getTime()
    : 0
  const needsRefresh = !row.access_token_ct || accessExpiry - REFRESH_LEEWAY_MS < Date.now()

  if (!needsRefresh && row.access_token_ct) {
    const accessToken = decryptToken(
      blob(row.access_token_ct, row.access_token_iv, row.access_token_tag),
    )
    return { accessToken, realmId: row.realm_id, environment: row.environment }
  }

  // Refresh.
  const refreshToken = decryptToken(
    blob(row.refresh_token_ct, row.refresh_token_iv, row.refresh_token_tag),
  )
  let tokens
  try {
    tokens = await refreshAccessToken(refreshToken)
  } catch (e) {
    // Intuit returns invalid_grant once the refresh token is dead — mark
    // the connection so the UI can prompt for reconnect.
    await markStatus(designerId, 'expired')
    throw e
  }

  const now = Date.now()
  const newAccessExpiry = new Date(now + tokens.accessTokenExpiresInSec * 1000)
  const newRefreshExpiry = new Date(now + tokens.refreshTokenExpiresInSec * 1000)
  const rtEnc = encryptToken(tokens.refreshToken)
  const atEnc = encryptToken(tokens.accessToken)
  const { error: upErr } = await sb
    .from('qbo_connections')
    .update({
      refresh_token_ct: bytesForDb(rtEnc.ciphertext),
      refresh_token_iv: bytesForDb(rtEnc.iv),
      refresh_token_tag: bytesForDb(rtEnc.authTag),
      refresh_token_expires_at: newRefreshExpiry.toISOString(),
      access_token_ct: bytesForDb(atEnc.ciphertext),
      access_token_iv: bytesForDb(atEnc.iv),
      access_token_tag: bytesForDb(atEnc.authTag),
      access_token_expires_at: newAccessExpiry.toISOString(),
      last_refreshed_at: new Date().toISOString(),
    })
    .eq('designer_id', designerId)
  if (upErr) throw upErr
  return {
    accessToken: tokens.accessToken,
    realmId: row.realm_id,
    environment: row.environment,
  }
}
