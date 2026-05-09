import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { resolveAssetUrls } from '@/lib/storage'
import ExpensesClient from './ExpensesClient'
import type {
  AccountRow,
  ExpenseRow,
  ProjectRow,
  VendorRow,
} from '@/lib/supabase/types'

export default async function ExpensesPage() {
  const ctx = await requireDesigner()
  requirePermission(ctx, 'finances:view')
  const sb = supabaseAdmin()

  const [eRes, aRes, pRes, vRes] = await Promise.all([
    sb
      .from('expenses')
      .select('*')
      .eq('designer_id', ctx.designerId)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false }),
    sb
      .from('accounts')
      .select('*')
      .eq('designer_id', ctx.designerId)
      .order('code', { ascending: true }),
    sb
      .from('projects')
      .select('*')
      .eq('designer_id', ctx.designerId)
      .order('created_at', { ascending: false }),
    sb
      .from('vendors')
      .select(
        'id, designer_id, name, is_1099_eligible, legal_name, tax_id_last4, created_at, updated_at',
      )
      .eq('designer_id', ctx.designerId)
      .order('name', { ascending: true }),
  ])

  const expenses = (eRes.data ?? []) as ExpenseRow[]
  const signed = await resolveAssetUrls(
    expenses.map((e) => e.receipt_path ?? e.receipt_url ?? null),
  )
  const initialExpenses = expenses.map((e, i) => ({
    ...e,
    receipt_url: signed[i],
  }))

  const canReconcile = hasPermission(ctx, 'finances:record_payments')

  return (
    <ExpensesClient
      initialExpenses={initialExpenses}
      initialAccounts={(aRes.data ?? []) as AccountRow[]}
      initialProjects={(pRes.data ?? []) as ProjectRow[]}
      initialVendors={(vRes.data ?? []) as VendorRow[]}
      canReconcile={canReconcile}
    />
  )
}
