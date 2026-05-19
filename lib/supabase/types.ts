// Hand-written DB types mirroring the SQL schema. For v1 we keep these in
// sync manually. TODO: replace with `supabase gen types typescript` output
// once the project is linked.

export type PricingMode = 'retail' | 'cost_plus'
export type ProjectStatus = 'active' | 'completed' | 'archived'
export type ItemStatus =
  | 'sourcing'
  | 'approved'
  | 'ordered'
  | 'received'
  | 'installed'
export type ProposalStatus =
  | 'draft'
  | 'sent'
  | 'partially_approved'
  | 'fully_approved'
export type InvoiceType = 'deposit' | 'progress' | 'final'
export type InvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'void'
export type DefaultInvoiceEmailMode = 'template' | 'ai'

// Shape of one entry appended to invoices.email_drafts on each send.
export interface InvoiceEmailDraftLog {
  kind: 'initial' | 'reminder'
  subject: string
  body_html: string
  recipients: string[]
  cc: string[]
  reply_to: string | null
  sent_at: string
  sent_by: string
  email_id: string | null
}
export type PoStatus =
  | 'draft'
  | 'sent'
  | 'acknowledged'
  | 'partially_received'
  | 'complete'
export type ActorType = 'designer' | 'client'
export type ClippingScrapeStatus = 'pending' | 'complete' | 'failed'
export type UserRole = 'designer' | 'admin'
export type CatalogDuplicateStatus =
  | 'pending'
  | 'confirmed_duplicate'
  | 'dismissed'

export interface UserRow {
  id: string
  clerk_user_id: string
  email: string
  name: string | null
  studio_name: string | null
  logo_url: string | null
  brand_color: string | null
  stripe_account_id: string | null
  pricing_mode: PricingMode
  default_markup_percent: number
  timezone: string | null
  default_hourly_rate_cents: number
  weekly_capacity_minutes: number
  auto_straighten_floor_plans: boolean
  role: UserRole
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type AccountingBasis = 'cash' | 'accrual'

export interface StudioRow {
  id: string
  name: string
  owner_user_id: string
  accounting_basis: AccountingBasis
  fiscal_year_start_month: number
  estimated_federal_tax_pct: number
  estimated_state_tax_pct: number
  estimated_self_employment_tax_pct: number
  tax_state_code: string | null
  default_invoice_email_mode: DefaultInvoiceEmailMode
  created_at: string
  updated_at: string
}

export interface ClientRow {
  id: string
  designer_id: string
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ProjectRow {
  id: string
  designer_id: string
  client_id: string | null
  name: string
  status: ProjectStatus
  budget_cents: number | null
  location: string | null
  notes: string | null
  floor_plan_url: string | null
  pricing_mode: PricingMode
  markup_percent: number
  created_at: string
  updated_at: string
}

export interface PolygonPoint {
  x: number
  y: number
}

export interface RoomRow {
  id: string
  designer_id: string
  project_id: string
  name: string
  floor_plan_x: number | null
  floor_plan_y: number | null
  floor_plan_width: number | null
  floor_plan_height: number | null
  floor_plan_polygon: PolygonPoint[] | null
  position: number
  created_at: string
  updated_at: string
}

export interface CatalogProductRow {
  id: string
  name: string
  vendor: string | null
  brand: string | null
  item_type: string | null
  style_tag: string | null
  retail_price_cents: number | null
  retail_price_last_seen_at: string | null
  source_url: string | null
  image_url: string | null
  clipped_count: number
  created_by: string | null
  description: string | null
  deleted_at: string | null
  merged_into_id: string | null
  merged_at: string | null
  created_at: string
  updated_at: string
  // Populated asynchronously after insert/update by lib/catalog/embed.ts.
  // Never sent to clients in API responses (large, no UI value).
  embedding?: number[] | null
  embedding_updated_at?: string | null
}

export interface CatalogDuplicateFlagRow {
  id: string
  product_a_id: string
  product_b_id: string
  similarity_score: number | null
  match_reasons: string[]
  status: CatalogDuplicateStatus
  resolved: boolean
  flagged_at: string
  last_seen_at: string
  resolved_at: string | null
  resolved_by: string | null
  resolution_notes: string | null
  created_at: string
  updated_at: string
}

// Catalog row returned by /api/catalog/search/image — same shape as
// CatalogProductRow but with the cosine similarity attached so the UI
// can show a confidence badge if we want one later.
export interface CatalogProductSearchHit extends CatalogProductRow {
  similarity: number
}

export interface ItemRow {
  id: string
  designer_id: string
  project_id: string
  room_id: string | null
  catalog_product_id: string | null
  name: string
  vendor: string | null
  image_url: string | null
  source_url: string | null
  trade_price_cents: number
  retail_price_cents: number | null
  client_price_cents: number
  quantity: number
  status: ItemStatus
  floor_plan_pin_x: number | null
  floor_plan_pin_y: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ClippingItemRow {
  id: string
  designer_id: string
  studio_id: string
  clipper_user_id: string
  project_id: string | null
  catalog_product_id: string | null
  source_url: string
  name: string | null
  vendor: string | null
  image_url: string | null
  retail_price_cents: number | null
  // Trade price is intentionally restricted: never returned by GET
  // /api/clippings; only read server-side during add-to-project.
  trade_price_cents: number | null
  description: string | null
  item_type: string | null
  scrape_status: ClippingScrapeStatus
  week_added: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface ProposalRow {
  id: string
  designer_id: string
  project_id: string
  status: ProposalStatus
  magic_link_token: string | null
  magic_link_revoked_at: string | null
  magic_link_expires_at: string | null
  sent_at: string | null
  client_notes: string | null
  created_at: string
  updated_at: string
}

export interface ProposalRoomRow {
  id: string
  designer_id: string
  proposal_id: string
  room_id: string
  approved_at: string | null
  client_comment: string | null
  position: number
  created_at: string
  updated_at: string
}

export interface InvoiceRow {
  id: string
  designer_id: string
  project_id: string
  type: InvoiceType
  status: InvoiceStatus
  total_cents: number
  stripe_payment_intent_id: string | null
  stripe_account_id: string | null
  magic_link_token: string | null
  magic_link_revoked_at: string | null
  magic_link_expires_at: string | null
  sent_at: string | null
  paid_at: string | null
  notes: string | null
  email_drafts: InvoiceEmailDraftLog[]
  email_send_count: number
  last_email_subject: string | null
  last_email_body_html: string | null
  voided_at: string | null
  void_reason: string | null
  refunded_cents: number
  created_at: string
  updated_at: string
}

export interface PaymentRefundRow {
  id: string
  designer_id: string
  invoice_id: string
  payment_id: string
  amount_cents: number
  stripe_refund_id: string | null
  reason: string | null
  created_at: string
}

export interface InvoiceLineItemRow {
  id: string
  designer_id: string
  invoice_id: string
  item_id: string | null
  description: string
  quantity: number
  unit_price_cents: number
  total_price_cents: number
  position: number
  created_at: string
  updated_at: string
}

export interface PaymentRow {
  id: string
  designer_id: string
  invoice_id: string
  amount_cents: number
  stripe_charge_id: string | null
  stripe_payment_intent_id: string | null
  platform_fee_cents: number
  received_at: string
  created_at: string
}

export interface PurchaseOrderRow {
  id: string
  designer_id: string
  project_id: string
  vendor_name: string
  vendor_email: string | null
  status: PoStatus
  expected_lead_time_days: number | null
  expected_delivery_date: string | null
  shipped_at: string | null
  delivered_at: string | null
  tracking_number: string | null
  tracking_url: string | null
  sent_at: string | null
  pdf_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PurchaseOrderLineItemRow {
  id: string
  designer_id: string
  po_id: string
  item_id: string | null
  description: string
  quantity: number
  trade_price_cents: number
  total_trade_price_cents: number
  position: number
  created_at: string
  updated_at: string
}

export interface VendorRow {
  id: string
  designer_id: string
  name: string
  account_number: string | null
  account_email: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  website: string | null
  // Stored as numeric(5,2). Supabase returns numeric as a string by
  // default; we normalize to number at the API layer before sending.
  trade_discount_percent: number | null
  default_lead_time_days: number | null
  payment_terms: string | null
  shipping_notes: string | null
  notes: string | null
  // 1099-NEC tracking. tax_id_full is never returned by the API to a user
  // without finances:view; the client sees only tax_id_last4.
  is_1099_eligible: boolean
  legal_name: string | null
  tax_id_last4: string | null
  tax_id_full: string | null
  address_line1: string | null
  address_line2: string | null
  address_city: string | null
  address_state: string | null
  address_postal_code: string | null
  address_country: string | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Bookkeeping
// ---------------------------------------------------------------------------

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense'

export type JournalSourceType = 'manual' | 'expense' | 'mileage' | 'payment'

// Schedule C (Form 1040) line groupings. NULL means "uncategorized — won't
// roll up into the Schedule C summary." Free-text rather than enum so we
// can extend without schema churn.
export type ScheduleCLine =
  | 'gross_receipts'      // Line 1
  | 'returns_allowances'  // Line 2
  | 'cogs'                // Line 4 / Part III
  | 'advertising'         // Line 8
  | 'car_truck'           // Line 9
  | 'commissions_fees'    // Line 10
  | 'contract_labor'      // Line 11
  | 'depletion'           // Line 12
  | 'depreciation'        // Line 13
  | 'employee_benefits'   // Line 14
  | 'insurance'           // Line 15
  | 'interest_mortgage'   // Line 16a
  | 'interest_other'      // Line 16b
  | 'legal_professional'  // Line 17
  | 'office'              // Line 18
  | 'pension_profit'      // Line 19
  | 'rent_lease_vehicle'  // Line 20a
  | 'rent_lease_other'    // Line 20b
  | 'repairs_maintenance' // Line 21
  | 'supplies'            // Line 22
  | 'taxes_licenses'      // Line 23
  | 'travel'              // Line 24a
  | 'meals'               // Line 24b
  | 'utilities'           // Line 25
  | 'wages'               // Line 26
  | 'other'               // Line 48 (Part V)

export interface AccountRow {
  id: string
  designer_id: string
  code: string
  name: string
  type: AccountType
  // Stable handle the auto-posting code uses to find well-known accounts.
  // Null for user-created categories.
  system_key: string | null
  is_system: boolean
  is_active: boolean
  schedule_c_line: ScheduleCLine | null
  description: string | null
  // Reconciliation: user marks an account as reconciled-through a date
  // when they tie it to a bank/CC statement.
  last_reconciled_through_date: string | null
  last_reconciled_at: string | null
  last_reconciled_by_user_id: string | null
  created_at: string
  updated_at: string
}

export interface JournalEntryRow {
  id: string
  designer_id: string
  entry_date: string
  memo: string | null
  source_type: JournalSourceType
  source_id: string | null
  created_at: string
  updated_at: string
}

export interface JournalLineRow {
  id: string
  designer_id: string
  entry_id: string
  account_id: string
  project_id: string | null
  // Signed: positive = debit, negative = credit.
  amount_cents: number
  memo: string | null
  position: number
  created_at: string
}

export interface ExpenseRow {
  id: string
  designer_id: string
  project_id: string | null
  category_account_id: string
  payment_account_id: string
  // Optional FK to vendors. Used for 1099 totals; vendor_name is kept for
  // free-text rows that don't belong to a vendor in the directory.
  vendor_id: string | null
  expense_date: string
  amount_cents: number
  vendor_name: string | null
  description: string | null
  receipt_path: string | null
  receipt_url: string | null
  receipt_content_type: string | null
  billable_to_client: boolean
  reconciled_at: string | null
  reconciled_by_user_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type EstimatedTaxJurisdiction = 'federal' | 'state'

export interface EstimatedTaxPaymentRow {
  id: string
  designer_id: string
  jurisdiction: EstimatedTaxJurisdiction
  tax_year: number
  quarter: number
  amount_cents: number
  paid_at: string | null
  reference: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface TimeEntryRow {
  id: string
  designer_id: string
  project_id: string
  user_id: string | null
  description: string
  started_at: string
  ended_at: string | null
  duration_minutes: number | null
  hourly_rate_cents: number
  billable: boolean
  invoice_line_item_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface MileageRateRow {
  id: string
  designer_id: string
  year: number
  rate_cents_per_mile: number
  created_at: string
  updated_at: string
}

export interface MileageLogRow {
  id: string
  designer_id: string
  project_id: string | null
  trip_date: string
  // numeric(8,2) — Supabase returns numeric as a string by default; the
  // API layer normalizes to number on read.
  miles: number
  rate_cents_per_mile: number
  amount_cents: number
  purpose: string | null
  from_location: string | null
  to_location: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ActivityLogRow {
  id: string
  designer_id: string
  project_id: string
  actor_type: ActorType
  actor_id: string | null
  event_type: string
  description: string
  metadata: Record<string, unknown>
  created_at: string
}
