import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import LedgerClient, { type LedgerResponse } from './LedgerClient'
import type {
  AccountRow,
  JournalEntryRow,
  JournalLineRow,
  ProjectRow,
} from '@/lib/supabase/types'

async function loadLedger(designerId: string): Promise<LedgerResponse> {
  const sb = supabaseAdmin()

  const { data: entries } = await sb
    .from('journal_entries')
    .select('*')
    .eq('designer_id', designerId)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100)

  const ids = (entries ?? []).map((e) => e.id)
  const lines: JournalLineRow[] = ids.length
    ? ((
        await sb
          .from('journal_lines')
          .select('*')
          .eq('designer_id', designerId)
          .in('entry_id', ids)
          .order('position', { ascending: true })
      ).data ?? []) as JournalLineRow[]
    : []

  const { data: accounts } = await sb
    .from('accounts')
    .select('id, code, name, type, system_key')
    .eq('designer_id', designerId)

  const linesByEntry = new Map<string, JournalLineRow[]>()
  for (const l of lines) {
    const arr = linesByEntry.get(l.entry_id) ?? []
    arr.push(l)
    linesByEntry.set(l.entry_id, arr)
  }

  return {
    entries: ((entries ?? []) as JournalEntryRow[]).map((e) => ({
      ...e,
      lines: linesByEntry.get(e.id) ?? [],
    })),
    accounts: (accounts ?? []) as LedgerResponse['accounts'],
  }
}

export default async function LedgerPage() {
  const { designerId, role, permissions } = await requireDesigner()
  requirePermission({ role, permissions }, 'finances:view')

  const [ledger, fullAccountsRes, projectsRes] = await Promise.all([
    loadLedger(designerId),
    supabaseAdmin()
      .from('accounts')
      .select('*')
      .eq('designer_id', designerId)
      .order('code', { ascending: true }),
    supabaseAdmin()
      .from('projects')
      .select('*')
      .eq('designer_id', designerId)
      .order('created_at', { ascending: false }),
  ])

  return (
    <LedgerClient
      initialData={ledger}
      initialProjects={(projectsRes.data ?? []) as ProjectRow[]}
      initialFullAccounts={(fullAccountsRes.data ?? []) as AccountRow[]}
    />
  )
}
