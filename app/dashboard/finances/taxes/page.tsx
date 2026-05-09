import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getStudioFinanceSettings } from '@/lib/finances/studio_settings'
import {
  getEstimatedTaxProjection,
  quarterDueDate,
} from '@/lib/finances/estimated_tax'
import EstimatedTaxClient from './EstimatedTaxClient'
import type { EstimatedTaxPaymentRow } from '@/lib/supabase/types'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function TaxesPage({ searchParams }: Props) {
  const ctx = await requireDesigner()
  requirePermission(ctx, 'finances:view')
  const settings = await getStudioFinanceSettings(ctx.studioId)

  const sp = await searchParams
  const yearParam = Array.isArray(sp.year) ? sp.year[0] : sp.year
  const taxYear = Number.isFinite(Number(yearParam))
    ? parseInt(yearParam!, 10)
    : new Date().getUTCFullYear()

  const [projection, paymentsRes] = await Promise.all([
    getEstimatedTaxProjection(ctx.designerId, taxYear, settings),
    supabaseAdmin()
      .from('estimated_tax_payments')
      .select('*')
      .eq('designer_id', ctx.designerId)
      .eq('tax_year', taxYear)
      .order('quarter', { ascending: true }),
  ])

  const payments = (paymentsRes.data ?? []) as EstimatedTaxPaymentRow[]

  const dueDates: Record<number, string> = {
    1: quarterDueDate(taxYear, 1).toISOString().slice(0, 10),
    2: quarterDueDate(taxYear, 2).toISOString().slice(0, 10),
    3: quarterDueDate(taxYear, 3).toISOString().slice(0, 10),
    4: quarterDueDate(taxYear, 4).toISOString().slice(0, 10),
  }

  const canEdit =
    ctx.role === 'owner' ||
    ctx.permissions.includes('finances:record_payments')

  return (
    <EstimatedTaxClient
      taxYear={taxYear}
      projection={projection}
      payments={payments}
      dueDates={dueDates}
      canEdit={canEdit}
      yearOptions={[taxYear, taxYear - 1, taxYear - 2, taxYear - 3]}
      settingsHref={`/dashboard/settings/finance`}
    />
  )
}

