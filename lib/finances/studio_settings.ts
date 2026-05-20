// Loads the studio-level finance settings (accounting basis, fiscal year
// start, estimated tax rates, default invoice email mode). Used by every
// report page and by the invoice Send modal to choose its default prefill.

import { supabaseAdmin } from '@/lib/supabase/server'
import type {
  AccountingBasis,
  DefaultInvoiceEmailMode,
} from '@/lib/supabase/types'

export interface StudioFinanceSettings {
  studio_id: string
  accounting_basis: AccountingBasis
  fiscal_year_start_month: number
  estimated_federal_tax_pct: number
  estimated_state_tax_pct: number
  estimated_self_employment_tax_pct: number
  tax_state_code: string | null
  default_invoice_email_mode: DefaultInvoiceEmailMode
  default_sales_tax_rate_bps: number
  default_sales_tax_state_code: string | null
}

export async function getStudioFinanceSettings(
  studioId: string,
): Promise<StudioFinanceSettings> {
  const { data, error } = await supabaseAdmin()
    .from('studios')
    .select(
      'id, accounting_basis, fiscal_year_start_month, estimated_federal_tax_pct, estimated_state_tax_pct, estimated_self_employment_tax_pct, tax_state_code, default_invoice_email_mode, default_sales_tax_rate_bps, default_sales_tax_state_code',
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
    default_invoice_email_mode:
      (data.default_invoice_email_mode as DefaultInvoiceEmailMode | null) ??
      'template',
    default_sales_tax_rate_bps: Number(data.default_sales_tax_rate_bps ?? 0),
    default_sales_tax_state_code: data.default_sales_tax_state_code,
  }
}
