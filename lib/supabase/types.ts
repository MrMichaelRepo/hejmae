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
export type InvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid'
export type PoStatus =
  | 'draft'
  | 'sent'
  | 'acknowledged'
  | 'partially_received'
  | 'complete'
export type ActorType = 'designer' | 'client'

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
  category: string | null
  retail_price_cents: number | null
  retail_price_last_seen_at: string | null
  source_url: string | null
  image_url: string | null
  style_tags: string[]
  clipped_count: number
  created_by: string | null
  created_at: string
  updated_at: string
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

export interface ProposalRow {
  id: string
  designer_id: string
  project_id: string
  status: ProposalStatus
  magic_link_token: string | null
  magic_link_revoked_at: string | null
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
  sent_at: string | null
  paid_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
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
