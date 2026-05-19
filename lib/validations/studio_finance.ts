import { z } from 'zod'

export const accountingBasis = z.enum(['cash', 'accrual'])

const pct = z.number().min(0).max(100)

export const defaultInvoiceEmailMode = z.enum(['template', 'ai'])

export const updateStudioFinance = z.object({
  accounting_basis: accountingBasis.optional(),
  fiscal_year_start_month: z.number().int().min(1).max(12).optional(),
  estimated_federal_tax_pct: pct.optional(),
  estimated_state_tax_pct: pct.optional(),
  estimated_self_employment_tax_pct: pct.optional(),
  tax_state_code: z
    .string()
    .length(2)
    .regex(/^[A-Z]{2}$/)
    .nullish(),
  default_invoice_email_mode: defaultInvoiceEmailMode.optional(),
})
