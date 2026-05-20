import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import BankingClient from './BankingClient'
import type { BankStatementImportRow, AccountRow } from '@/lib/supabase/types'

export default async function BankingPage() {
  const ctx = await requireDesigner()
  requirePermission(ctx, 'finances:view')
  const sb = supabaseAdmin()
  const [importsRes, acctsRes] = await Promise.all([
    sb
      .from('bank_statement_imports')
      .select('*')
      .eq('designer_id', ctx.designerId)
      .order('uploaded_at', { ascending: false })
      .limit(50),
    sb
      .from('accounts')
      .select('*')
      .eq('designer_id', ctx.designerId)
      .eq('is_active', true)
      .in('type', ['asset', 'liability'])
      .order('code', { ascending: true }),
  ])
  return (
    <BankingClient
      initialImports={(importsRes.data ?? []) as BankStatementImportRow[]}
      cashAccounts={(acctsRes.data ?? []) as AccountRow[]}
    />
  )
}
