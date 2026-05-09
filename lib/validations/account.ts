import { z } from 'zod'

const scheduleCLine = z.enum([
  'gross_receipts',
  'returns_allowances',
  'cogs',
  'advertising',
  'car_truck',
  'commissions_fees',
  'contract_labor',
  'depletion',
  'depreciation',
  'employee_benefits',
  'insurance',
  'interest_mortgage',
  'interest_other',
  'legal_professional',
  'office',
  'pension_profit',
  'rent_lease_vehicle',
  'rent_lease_other',
  'repairs_maintenance',
  'supplies',
  'taxes_licenses',
  'travel',
  'meals',
  'utilities',
  'wages',
  'other',
])

export const updateAccount = z.object({
  name: z.string().min(1).max(200).optional(),
  schedule_c_line: scheduleCLine.nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  is_active: z.boolean().optional(),
})
