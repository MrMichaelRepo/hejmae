// qbo_external_refs CRUD + qbo_sync_log writer.
//
// Every entity sync resolves through these: look up the existing ref (if
// any), call QBO, persist the new ref + sync_token, log the outcome.

import { supabaseAdmin } from '@/lib/supabase/server'
import type {
  QboEntityType,
  QboExternalRefRow,
  QboSyncDirection,
  QboSyncStatus,
} from '@/lib/supabase/types'

export async function getRef(
  designerId: string,
  entityType: QboEntityType,
  hejmaeId: string,
): Promise<QboExternalRefRow | null> {
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from('qbo_external_refs')
    .select('*')
    .eq('designer_id', designerId)
    .eq('entity_type', entityType)
    .eq('hejmae_id', hejmaeId)
    .maybeSingle()
  if (error) throw error
  return (data as QboExternalRefRow | null) ?? null
}

export async function getRefByQboId(
  designerId: string,
  entityType: QboEntityType,
  qboId: string,
): Promise<QboExternalRefRow | null> {
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from('qbo_external_refs')
    .select('*')
    .eq('designer_id', designerId)
    .eq('entity_type', entityType)
    .eq('qbo_id', qboId)
    .maybeSingle()
  if (error) throw error
  return (data as QboExternalRefRow | null) ?? null
}

export interface RefUpsertInput {
  designerId: string
  entityType: QboEntityType
  hejmaeId: string
  qboId: string
  syncToken?: string | null
}

export async function upsertRef(input: RefUpsertInput): Promise<void> {
  const sb = supabaseAdmin()
  const { error } = await sb.from('qbo_external_refs').upsert(
    {
      designer_id: input.designerId,
      entity_type: input.entityType,
      hejmae_id: input.hejmaeId,
      qbo_id: input.qboId,
      qbo_sync_token: input.syncToken ?? null,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: 'designer_id,entity_type,hejmae_id' },
  )
  if (error) throw error
}

export async function deleteRef(
  designerId: string,
  entityType: QboEntityType,
  hejmaeId: string,
): Promise<void> {
  const sb = supabaseAdmin()
  const { error } = await sb
    .from('qbo_external_refs')
    .delete()
    .eq('designer_id', designerId)
    .eq('entity_type', entityType)
    .eq('hejmae_id', hejmaeId)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Sync log
// ---------------------------------------------------------------------------

export interface SyncLogInput {
  designerId: string
  entityType: QboEntityType
  hejmaeId?: string | null
  qboId?: string | null
  direction: QboSyncDirection
  status: QboSyncStatus
  errorCode?: string | null
  errorMessage?: string | null
}

export async function writeSyncLog(input: SyncLogInput): Promise<void> {
  const sb = supabaseAdmin()
  const { error } = await sb.from('qbo_sync_log').insert({
    designer_id: input.designerId,
    entity_type: input.entityType,
    hejmae_id: input.hejmaeId ?? null,
    qbo_id: input.qboId ?? null,
    direction: input.direction,
    status: input.status,
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage ?? null,
  })
  // Never throw from the logger — a logging failure mustn't mask the
  // underlying sync result.
  if (error) console.error('[qbo] writeSyncLog failed', error)
}

export async function listSyncLog(
  designerId: string,
  opts: { limit?: number; entityType?: QboEntityType; hejmaeId?: string } = {},
): Promise<Array<{
  id: string
  entity_type: QboEntityType
  hejmae_id: string | null
  qbo_id: string | null
  direction: QboSyncDirection
  status: QboSyncStatus
  error_code: string | null
  error_message: string | null
  created_at: string
}>> {
  const sb = supabaseAdmin()
  let q = sb
    .from('qbo_sync_log')
    .select(
      'id, entity_type, hejmae_id, qbo_id, direction, status, error_code, error_message, created_at',
    )
    .eq('designer_id', designerId)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100)
  if (opts.entityType) q = q.eq('entity_type', opts.entityType)
  if (opts.hejmaeId) q = q.eq('hejmae_id', opts.hejmaeId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Array<{
    id: string
    entity_type: QboEntityType
    hejmae_id: string | null
    qbo_id: string | null
    direction: QboSyncDirection
    status: QboSyncStatus
    error_code: string | null
    error_message: string | null
    created_at: string
  }>
}
