// Pure mappers: hejmae row → QBO entity payload.
//
// No IO here. Sync functions in lib/qbo/sync.ts resolve refs (account
// mappings, customer/vendor refs) and assemble the final payload.

import type {
  ClientRow,
  ExpenseRow,
  InvoiceLineItemRow,
  InvoiceRow,
  JournalEntryRow,
  JournalLineRow,
  PaymentRow,
  VendorRow,
} from '@/lib/supabase/types'

function dollars(cents: number): number {
  return Math.round(cents) / 100
}

function isoDate(value: string): string {
  // QBO expects "YYYY-MM-DD" for date-only fields. Our timestamps come in
  // as ISO strings; slice the date portion.
  return value.slice(0, 10)
}

// ---------------------------------------------------------------------------
// Customer (from ClientRow)
// ---------------------------------------------------------------------------

export function clientToCustomer(
  c: ClientRow,
  existingSyncToken?: string | null,
  existingQboId?: string | null,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    DisplayName: c.name,
  }
  if (c.email) payload.PrimaryEmailAddr = { Address: c.email }
  if (c.phone) payload.PrimaryPhone = { FreeFormNumber: c.phone }
  if (c.notes) payload.Notes = c.notes
  if (existingQboId) {
    payload.Id = existingQboId
    payload.SyncToken = existingSyncToken ?? '0'
    payload.sparse = true
  }
  return payload
}

// ---------------------------------------------------------------------------
// Vendor (from VendorRow)
// ---------------------------------------------------------------------------

export function vendorToVendor(
  v: VendorRow,
  existingSyncToken?: string | null,
  existingQboId?: string | null,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    DisplayName: v.name,
    Vendor1099: v.is_1099_eligible,
  }
  if (v.legal_name) payload.CompanyName = v.legal_name
  const email = v.contact_email ?? v.account_email
  if (email) payload.PrimaryEmailAddr = { Address: email }
  if (v.contact_phone) payload.PrimaryPhone = { FreeFormNumber: v.contact_phone }
  if (v.website) payload.WebAddr = { URI: v.website }
  if (v.tax_id_full) payload.TaxIdentifier = v.tax_id_full
  if (v.address_line1 || v.address_city) {
    payload.BillAddr = {
      Line1: v.address_line1,
      Line2: v.address_line2,
      City: v.address_city,
      CountrySubDivisionCode: v.address_state,
      PostalCode: v.address_postal_code,
      Country: v.address_country,
    }
  }
  if (v.payment_terms) payload.Notes = `Terms: ${v.payment_terms}${v.notes ? ` — ${v.notes}` : ''}`
  else if (v.notes) payload.Notes = v.notes
  if (existingQboId) {
    payload.Id = existingQboId
    payload.SyncToken = existingSyncToken ?? '0'
    payload.sparse = true
  }
  return payload
}

// ---------------------------------------------------------------------------
// Invoice (from InvoiceRow + line items + customer ref + default item ref)
// ---------------------------------------------------------------------------

export interface InvoiceMapperInput {
  invoice: InvoiceRow
  lines: InvoiceLineItemRow[]
  customerQboId: string
  defaultItemQboId: string
  existingSyncToken?: string | null
  existingQboId?: string | null
}

export function invoiceToQbo(input: InvoiceMapperInput): Record<string, unknown> {
  const { invoice, lines, customerQboId, defaultItemQboId } = input
  const qboLines = lines.map((l) => ({
    DetailType: 'SalesItemLineDetail',
    Amount: dollars(l.total_price_cents),
    Description: l.description,
    SalesItemLineDetail: {
      ItemRef: { value: defaultItemQboId },
      UnitPrice: dollars(l.unit_price_cents),
      Qty: l.quantity,
    },
  }))
  const payload: Record<string, unknown> = {
    CustomerRef: { value: customerQboId },
    TxnDate: isoDate(invoice.created_at),
    Line: qboLines,
    PrivateNote: invoice.notes ?? undefined,
    DocNumber: invoice.id.slice(0, 8),
  }
  if (input.existingQboId) {
    payload.Id = input.existingQboId
    payload.SyncToken = input.existingSyncToken ?? '0'
    payload.sparse = false // Invoice updates must be full replace.
  }
  return payload
}

// ---------------------------------------------------------------------------
// Payment (from PaymentRow + customer ref + invoice ref)
// ---------------------------------------------------------------------------

export interface PaymentMapperInput {
  payment: PaymentRow
  customerQboId: string
  invoiceQboId: string
  existingSyncToken?: string | null
  existingQboId?: string | null
}

export function paymentToQbo(input: PaymentMapperInput): Record<string, unknown> {
  const { payment, customerQboId, invoiceQboId } = input
  const amount = dollars(payment.amount_cents)
  const payload: Record<string, unknown> = {
    CustomerRef: { value: customerQboId },
    TotalAmt: amount,
    TxnDate: isoDate(payment.received_at),
    Line: [
      {
        Amount: amount,
        LinkedTxn: [{ TxnId: invoiceQboId, TxnType: 'Invoice' }],
      },
    ],
  }
  if (input.existingQboId) {
    payload.Id = input.existingQboId
    payload.SyncToken = input.existingSyncToken ?? '0'
    payload.sparse = false
  }
  return payload
}

// ---------------------------------------------------------------------------
// Expense (from ExpenseRow + payment-account ref + category-account ref +
// optional vendor ref). Maps to QBO Purchase (the cash/card spend entity).
// ---------------------------------------------------------------------------

export interface ExpenseMapperInput {
  expense: ExpenseRow
  paymentAccountQboId: string
  categoryAccountQboId: string
  vendorQboId: string | null
  // 'Cash' (Bank), 'CreditCard' (Credit Card account), or undefined.
  paymentType: 'Cash' | 'Check' | 'CreditCard'
  existingSyncToken?: string | null
  existingQboId?: string | null
}

export function expenseToQbo(input: ExpenseMapperInput): Record<string, unknown> {
  const { expense, paymentAccountQboId, categoryAccountQboId, vendorQboId, paymentType } = input
  const payload: Record<string, unknown> = {
    AccountRef: { value: paymentAccountQboId },
    PaymentType: paymentType,
    TxnDate: isoDate(expense.expense_date),
    PrivateNote: expense.description ?? expense.notes ?? undefined,
    Line: [
      {
        DetailType: 'AccountBasedExpenseLineDetail',
        Amount: dollars(expense.amount_cents),
        Description: expense.description ?? undefined,
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: categoryAccountQboId },
        },
      },
    ],
  }
  if (vendorQboId) {
    payload.EntityRef = { value: vendorQboId, type: 'Vendor' }
  }
  if (input.existingQboId) {
    payload.Id = input.existingQboId
    payload.SyncToken = input.existingSyncToken ?? '0'
    payload.sparse = false
  }
  return payload
}

// ---------------------------------------------------------------------------
// JournalEntry (from JournalEntryRow + lines, with all account refs already
// resolved to QBO ids). hejmae stores signed amounts (positive=debit); QBO
// wants explicit Debit/Credit posting type with positive amounts.
// ---------------------------------------------------------------------------

export interface JeMapperInput {
  entry: JournalEntryRow
  lines: Array<{ line: JournalLineRow; accountQboId: string }>
  existingSyncToken?: string | null
  existingQboId?: string | null
}

export function journalEntryToQbo(input: JeMapperInput): Record<string, unknown> {
  const qboLines = input.lines.map((l) => ({
    DetailType: 'JournalEntryLineDetail',
    Amount: Math.abs(dollars(l.line.amount_cents)),
    Description: l.line.memo ?? input.entry.memo ?? undefined,
    JournalEntryLineDetail: {
      PostingType: l.line.amount_cents >= 0 ? 'Debit' : 'Credit',
      AccountRef: { value: l.accountQboId },
    },
  }))
  const payload: Record<string, unknown> = {
    TxnDate: isoDate(input.entry.entry_date),
    PrivateNote: input.entry.memo ?? undefined,
    DocNumber: input.entry.id.slice(0, 8),
    Line: qboLines,
  }
  if (input.existingQboId) {
    payload.Id = input.existingQboId
    payload.SyncToken = input.existingSyncToken ?? '0'
    payload.sparse = false
  }
  return payload
}
