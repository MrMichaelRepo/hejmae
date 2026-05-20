import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ReviewClient from './ReviewClient'
import type {
  AccountRow,
  BankStatementImportRow,
  BankTransactionRow,
  VendorRow,
} from '@/lib/supabase/types'

interface Props {
  params: Promise<{ importId: string }>
}

export default async function ReviewPage({ params }: Props) {
  const ctx = await requireDesigner()
  requirePermission(ctx, 'finances:view')
  const { importId } = await params
  const sb = supabaseAdmin()
  const { data: importRow } = await sb
    .from('bank_statement_imports')
    .select('*')
    .eq('id', importId)
    .eq('designer_id', ctx.designerId)
    .maybeSingle()
  if (!importRow) notFound()

  const [accountsRes, vendorsRes] = await Promise.all([
    sb
      .from('accounts')
      .select('*')
      .eq('designer_id', ctx.designerId)
      .eq('is_active', true)
      .order('code', { ascending: true }),
    sb
      .from('vendors')
      .select('id, name')
      .eq('designer_id', ctx.designerId)
      .order('name', { ascending: true }),
  ])

  return (
    <ReviewClient
      importRow={importRow as BankStatementImportRow}
      accounts={(accountsRes.data ?? []) as AccountRow[]}
      vendors={(vendorsRes.data ?? []) as Pick<VendorRow, 'id' | 'name'>[]}
    />
  )
}
