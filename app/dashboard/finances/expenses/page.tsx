import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { resolveAssetUrls } from '@/lib/storage'
import ExpensesClient from './ExpensesClient'
import type {
  AccountRow,
  ExpenseRow,
  ProjectRow,
} from '@/lib/supabase/types'

export default async function ExpensesPage() {
  const { designerId, role, permissions } = await requireDesigner()
  requirePermission({ role, permissions }, 'finances:view')
  const sb = supabaseAdmin()

  const [eRes, aRes, pRes] = await Promise.all([
    sb
      .from('expenses')
      .select('*')
      .eq('designer_id', designerId)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false }),
    sb
      .from('accounts')
      .select('*')
      .eq('designer_id', designerId)
      .order('code', { ascending: true }),
    sb
      .from('projects')
      .select('*')
      .eq('designer_id', designerId)
      .order('created_at', { ascending: false }),
  ])

  const expenses = (eRes.data ?? []) as ExpenseRow[]
  const signed = await resolveAssetUrls(
    expenses.map((e) => e.receipt_path ?? e.receipt_url ?? null),
  )
  const initialExpenses = expenses.map((e, i) => ({
    ...e,
    receipt_url: signed[i],
  }))

  return (
    <ExpensesClient
      initialExpenses={initialExpenses}
      initialAccounts={(aRes.data ?? []) as AccountRow[]}
      initialProjects={(pRes.data ?? []) as ProjectRow[]}
    />
  )
}
