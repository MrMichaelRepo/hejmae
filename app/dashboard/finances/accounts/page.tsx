import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import AccountsClient from './AccountsClient'
import type { AccountRow } from '@/lib/supabase/types'

export default async function AccountsPage() {
  const ctx = await requireDesigner()
  requirePermission(ctx, 'finances:view')

  const { data } = await supabaseAdmin()
    .from('accounts')
    .select('*')
    .eq('designer_id', ctx.designerId)
    .order('code', { ascending: true })

  const canEdit =
    ctx.role === 'owner' ||
    ctx.permissions.includes('finances:manage_settings')
  const canReconcile =
    ctx.role === 'owner' ||
    ctx.permissions.includes('finances:record_payments')

  return (
    <AccountsClient
      initialAccounts={(data ?? []) as AccountRow[]}
      canEdit={canEdit}
      canReconcile={canReconcile}
    />
  )
}
