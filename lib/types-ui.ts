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
  ProjectRow as Project,
  ClientRow as Client,
  RoomRow as Room,
  ItemRow as Item,
  CatalogProductRow as CatalogProduct,
  ProposalRow as Proposal,
  ProposalRoomRow as ProposalRoom,
  InvoiceRow as Invoice,
  InvoiceLineItemRow as InvoiceLine,
  PaymentRow as Payment,
  PurchaseOrderRow as PurchaseOrder,
  PurchaseOrderLineItemRow as PurchaseOrderLine,
  ActivityLogRow as ActivityLog,
  UserRow as DesignerUser,
} from '@/lib/supabase/types'
