// Shared SELECT column list for catalog_products. Use this anywhere code
// fetches a full catalog row — the admin list, edit drawer round-trip,
// duplicate-flags view, etc. Adding a column to catalog_products means
// updating this one constant instead of three call sites.

export const CATALOG_PRODUCT_COLUMNS =
  'id, name, vendor, brand, item_type, style_tag, retail_price_cents, retail_price_last_seen_at, source_url, image_url, description, clipped_count, created_by, deleted_at, merged_into_id, merged_at, created_at, updated_at'

// Same set + embedding_updated_at, for admin views that show the
// embedding freshness column.
export const CATALOG_PRODUCT_ADMIN_COLUMNS =
  `${CATALOG_PRODUCT_COLUMNS}, embedding_updated_at`
