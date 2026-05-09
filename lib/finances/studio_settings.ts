// Loads the studio-level finance settings (accounting basis, fiscal year
// start, estimated tax rates). Used by every report page.

import { supabaseAdmin } from '@/lib/supabase/server'
import type { AccountingBasis } from '@/lib/supabase/types'

export interface StudioFinanceSettings {
  studio_id: string
  accounting_basis: AccountingBasis
  fiscal_year_start_month: number
  estimated_federal_tax_pct: number
  estimated_state_tax_pct: number
  estimated_self_employment_tax_pct: number
  tax_state_code: string | null
}

export async function getStudioFinanceSettings(
  studioId: string,
): Promise<StudioFinanceSettings> {
  const { data, error } = await supabaseAdmin()
    .from('studios')
    .select(
      'id, accounting_basis, fiscal_year_start_month, estimated_federal_tax_pct, estimated_state_tax_pct, estimated_self_employment_tax_pct, tax_state_code',
    )
    .eq('id', studioId)
    .single()
  if (error) throw error
  return {
    studio_id: data.id,
    accounting_basis: data.accounting_basis,
    fiscal_year_start_month: data.fiscal_year_start_month,
    estimated_federal_tax_pct: Number(data.estimated_federal_tax_pct),
    estimated_state_tax_pct: Number(data.estimated_state_tax_pct),
    estimated_self_employment_tax_pct: Number(
      data.estimated_self_employment_tax_pct,
    ),
    tax_state_code: data.tax_state_code,
  }
}
