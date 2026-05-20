// QBO chart-of-accounts helpers + hejmae↔QBO account mapping.
//
// Account mappings are stored as qbo_external_refs rows with
// entity_type='account', where:
//   * hejmae_id = the hejmae accounts.id (uuid as string)
//   * qbo_id    = the QBO Account.Id  (numeric string)
//
// Mappings are user-driven, set via the settings UI. Sync paths that need
// an account ref (invoice income line, expense category, journal entry
// line) read them with requireAccountMapping().

import { qboFetch, QboNotConnectedError } from '@/lib/qbo/client'
import { getRef, upsertRef, deleteRef } from '@/lib/qbo/refs'
import { assertOwnsAccounts } from '@/lib/auth/ownership-accounts'

export interface QboAccount {
  id: string
  name: string
  fullyQualifiedName: string
  accountType: string
  accountSubType: string | null
  classification: string | null
  active: boolean
  currentBalance: number | null
}

interface RawQboAccount {
  Id: string
  Name: string
  FullyQualifiedName: string
  AccountType: string
  AccountSubType?: string
  Classification?: string
  Active: boolean
  CurrentBalance?: number
}

export async function listQboAccounts(designerId: string): Promise<QboAccount[]> {
  // QBO query API. ACCOUNT is the entity name. We pull active and inactive
  // both so a stale mapping doesn't silently break, but the UI filters by
  // active for the picker.
  const data = (await qboFetch(designerId, 'query', {
    query: { query: 'SELECT * FROM Account MAXRESULTS 1000' },
  })) as { QueryResponse?: { Account?: RawQboAccount[] } }
  const rows = data.QueryResponse?.Account ?? []
  return rows.map((r) => ({
    id: r.Id,
    name: r.Name,
    fullyQualifiedName: r.FullyQualifiedName,
    accountType: r.AccountType,
    accountSubType: r.AccountSubType ?? null,
    classification: r.Classification ?? null,
    active: r.Active,
    currentBalance: typeof r.CurrentBalance === 'number' ? r.CurrentBalance : null,
  }))
}

export async function setAccountMapping(
  designerId: string,
  hejmaeAccountId: string,
  qboAccountId: string,
): Promise<void> {
  // Refuse to register a mapping for an account the caller doesn't own —
  // the ref table is tenant-scoped, but accepting foreign hejmae_ids would
  // let an attacker pollute their own sync with another studio's account
  // ids (low impact, but no reason to allow it).
  await assertOwnsAccounts(designerId, [hejmaeAccountId])
  await upsertRef({
    designerId,
    entityType: 'account',
    hejmaeId: hejmaeAccountId,
    qboId: qboAccountId,
  })
}

export async function clearAccountMapping(
  designerId: string,
  hejmaeAccountId: string,
): Promise<void> {
  // No ownership check needed: deleteRef is already scoped by designer_id,
  // so a foreign hejmae_id just no-ops against the ref table.
  await deleteRef(designerId, 'account', hejmaeAccountId)
}

export async function getAccountMapping(
  designerId: string,
  hejmaeAccountId: string,
): Promise<string | null> {
  const ref = await getRef(designerId, 'account', hejmaeAccountId)
  return ref?.qbo_id ?? null
}

export class AccountMappingMissingError extends Error {
  hejmaeAccountId: string
  constructor(hejmaeAccountId: string) {
    super(`No QBO account mapping for hejmae account ${hejmaeAccountId}`)
    this.name = 'AccountMappingMissingError'
    this.hejmaeAccountId = hejmaeAccountId
  }
}

export async function requireAccountMapping(
  designerId: string,
  hejmaeAccountId: string,
): Promise<string> {
  const id = await getAccountMapping(designerId, hejmaeAccountId)
  if (!id) throw new AccountMappingMissingError(hejmaeAccountId)
  return id
}

export { QboNotConnectedError }
