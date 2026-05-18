// Frontend-facing type aliases that mirror the API response shapes. We
// keep these separate from lib/supabase/types.ts to make it explicit when
// a value comes from a JSON fetch rather than directly from the DB layer.

export type {
  PricingMode,
  ProjectStatus,
  ItemStatus,
  ProposalStatus,
  InvoiceType,
  InvoiceStatus,
  PoStatus,
  ActorType,
  PolygonPoint,
  FloorPlanVector,
  FloorPlanVectorWall,
  FloorPlanVectorDoor,
  FloorPlanVectorWindow,
  FloorPlanVectorRoomLabel,
  ProjectRow as Project,
  ClientRow as Client,
  RoomRow as Room,
  ItemRow as Item,
  CatalogProductRow as CatalogProduct,
  CatalogProductSearchHit,
  ProposalRow as Proposal,
  ProposalRoomRow as ProposalRoom,
  InvoiceRow as Invoice,
  InvoiceLineItemRow as InvoiceLine,
  PaymentRow as Payment,
  PurchaseOrderRow as PurchaseOrder,
  PurchaseOrderLineItemRow as PurchaseOrderLine,
  ActivityLogRow as ActivityLog,
  VendorRow as Vendor,
  UserRow as DesignerUser,
  ClippingItemRow as ClippingItem,
  ClippingScrapeStatus,
} from '@/lib/supabase/types'

// Display-augmented clipping row: GET /api/clippings strips trade price
// and joins the clipper's name/avatar so cards can render directly.
export interface ClippingItemFeedRow {
  id: string
  designer_id: string
  studio_id: string
  clipper_user_id: string
  project_id: string | null
  catalog_product_id: string | null
  source_url: string
  name: string | null
  brand: string | null
  image_url: string | null
  retail_price_cents: number | null
  description: string | null
  item_type: string | null
  material: string | null
  scrape_status: import('@/lib/supabase/types').ClippingScrapeStatus
  week_added: string
  created_at: string
  clipper: {
    id: string
    name: string | null
    email: string
    logo_url: string | null
  }
  project: { id: string; name: string } | null
}
