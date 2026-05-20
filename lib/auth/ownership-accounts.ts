// Verify that a set of accounts.id values all belong to the same designer.
// Used by every code path that takes account_id from a user payload — the FK
// constraint only checks existence, not tenant-scope.
//
// Throws `notFound` if any id is missing or doesn't belong to the caller's
// studio. Returns the matched rows for callers that want them back (mostly
// useful in tests; in routes we just need the side effect of the check).

import { supabaseAdmin } from '@/lib/supabase/server'
import { notFound } from '@/lib/errors'

export async function assertOwnsAccounts(
  designerId: string,
  accountIds: ReadonlyArray<string | null | undefined>,
): Promise<void> {
  const cleaned = Array.from(
    new Set(accountIds.filter((x): x is string => typeof x === 'string' && x.length > 0)),
  )
  if (cleaned.length === 0) return
  const { data, error } = await supabaseAdmin()
    .from('accounts')
    .select('id')
    .eq('designer_id', designerId)
    .in('id', cleaned)
  if (error) throw error
  const found = new Set((data ?? []).map((r) => (r as { id: string }).id))
  for (const id of cleaned) {
    if (!found.has(id)) throw notFound(`Account ${id} not found`)
  }
}
