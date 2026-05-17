// HTML → ScrapedProduct extraction. Targets, in priority order:
//   1. JSON-LD schema.org Product (name, image, offers.price/priceCurrency,
//      brand, description, category)
//   2. Open Graph (og:title, og:image, og:price:amount, og:description)
//   3. <title> + <meta name=description> as fallbacks for name/description
//   4. URL hostname → vendor as a last-resort label
//
// All money is normalized to integer cents (currency-agnostic for now —
// we record the cents value as-is even for non-USD; multi-currency is a
// future concern).

import { load, type CheerioAPI } from 'cheerio'

export interface ScrapedProduct {
  name: string | null
  vendor: string | null
  image_url: string | null
  retail_price_cents: number | null
  description: string | null
  item_type: string | null
}

export function scrapeProductHtml(
  html: string,
  url: string,
  fallbackTitle?: string | null,
): ScrapedProduct {
  const $ = load(html)
  const ld = collectJsonLdProducts($)
  // __NEXT_DATA__ from Next.js sites (Pottery Barn / Rejuvenation /
  // Williams-Sonoma family and most React storefronts). Cheap, no
  // network, plays the same role as JSON-LD for sites that just don't
  // emit schema.org markup.
  const nd = extractFromNextData($)

  const name =
    pickStr(ld, 'name') ??
    nd.name ??
    metaContent($, 'og:title') ??
    microdataValue($, 'name') ??
    cleanTitle($('title').first().text()) ??
    fallbackTitle?.trim() ??
    null

  const description =
    pickStr(ld, 'description') ??
    nd.description ??
    metaContent($, 'og:description') ??
    metaName($, 'description') ??
    microdataValue($, 'description') ??
    null

  const image =
    firstImageFromLd(ld) ??
    nd.image_url ??
    metaContent($, 'og:image') ??
    metaContent($, 'og:image:secure_url') ??
    microdataValue($, 'image') ??
    null

  const price =
    priceFromLd(ld) ??
    nd.retail_price_cents ??
    priceFromMeta($) ??
    parsePriceToCents(microdataValue($, 'price'))

  const brand =
    pickStr(ld, 'brand') ??
    brandFromLd(ld) ??
    nd.vendor ??
    microdataValue($, 'brand')
  const vendor = brand ?? metaContent($, 'og:site_name') ?? vendorFromHostname(url)

  const itemType = pickStr(ld, 'category') ?? null

  return {
    name: name ? trimMax(name, 300) : null,
    vendor: vendor ? trimMax(vendor, 200) : null,
    image_url: image,
    retail_price_cents: price,
    description: description ? trimMax(description, 4000) : null,
    item_type: itemType ? trimMax(itemType, 100) : null,
  }
}

export function vendorFromHostname(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const root = host.split('.').slice(-2, -1)[0] ?? host
    if (!root) return null
    return root
      .split(/[-_]/)
      .map((p) => (p ? p[0]!.toUpperCase() + p.slice(1) : p))
      .join(' ')
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// JSON-LD helpers
// ---------------------------------------------------------------------------

interface LdProduct {
  [key: string]: unknown
}

function collectJsonLdProducts($: CheerioAPI): LdProduct[] {
  const out: LdProduct[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text()
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as unknown
      walkLd(parsed, out)
    } catch {
      // Soft-fail: malformed JSON-LD is common in the wild.
    }
  })
  return out
}

function walkLd(node: unknown, out: LdProduct[]): void {
  if (!node) return
  if (Array.isArray(node)) {
    node.forEach((n) => walkLd(n, out))
    return
  }
  if (typeof node !== 'object') return
  const rec = node as Record<string, unknown>
  if (rec['@graph']) walkLd(rec['@graph'], out)
  const t = rec['@type']
  const types = Array.isArray(t) ? t : t ? [t] : []
  if (types.includes('Product') || types.includes('ItemPage')) {
    out.push(rec)
  }
}

function pickStr(ld: LdProduct[], key: string): string | null {
  for (const p of ld) {
    const v = p[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

function firstImageFromLd(ld: LdProduct[]): string | null {
  for (const p of ld) {
    const v = p['image']
    if (typeof v === 'string') return v
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>
          if (typeof rec.url === 'string') return rec.url
          if (typeof rec.contentUrl === 'string') return rec.contentUrl
        }
      }
    }
    if (v && typeof v === 'object') {
      const rec = v as Record<string, unknown>
      if (typeof rec.url === 'string') return rec.url
      if (typeof rec.contentUrl === 'string') return rec.contentUrl
    }
  }
  return null
}

function brandFromLd(ld: LdProduct[]): string | null {
  for (const p of ld) {
    const v = p['brand']
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (v && typeof v === 'object') {
      const rec = v as Record<string, unknown>
      if (typeof rec.name === 'string' && rec.name.trim()) return rec.name.trim()
    }
  }
  return null
}

function priceFromLd(ld: LdProduct[]): number | null {
  for (const p of ld) {
    const offers = p['offers']
    const cents = priceFromOffers(offers)
    if (cents != null) return cents
  }
  return null
}

function priceFromOffers(offers: unknown): number | null {
  if (!offers) return null
  if (Array.isArray(offers)) {
    for (const o of offers) {
      const cents = priceFromOffers(o)
      if (cents != null) return cents
    }
    return null
  }
  if (typeof offers !== 'object') return null
  const rec = offers as Record<string, unknown>
  const candidates = [rec.price, rec.lowPrice, rec.highPrice]
  for (const c of candidates) {
    const cents = parsePriceToCents(c)
    if (cents != null) return cents
  }
  // Nested PriceSpecification.
  const ps = rec.priceSpecification
  if (ps) {
    const cents = priceFromOffers(ps)
    if (cents != null) return cents
  }
  return null
}

function priceFromMeta($: CheerioAPI): number | null {
  const candidates = [
    metaContent($, 'og:price:amount'),
    metaContent($, 'product:price:amount'),
    metaContent($, 'twitter:data1'),
  ]
  for (const c of candidates) {
    const cents = parsePriceToCents(c)
    if (cents != null) return cents
  }
  return null
}

// Parse "1,299.00" / "$1,299" / "1299.5" / "1.299,00" → integer cents.
// Returns null when the input doesn't look like a number.
export function parsePriceToCents(input: unknown): number | null {
  if (input == null) return null
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return null
    return Math.round(input * 100)
  }
  if (typeof input !== 'string') return null
  const s = input.trim()
  if (!s) return null

  // Strip currency symbols / codes.
  const cleaned = s.replace(/[^\d.,]/g, '')
  if (!cleaned) return null

  // Decide which separator is the decimal: whichever appears last and
  // has 1–2 digits after it (or assume "." if neither is unambiguous).
  let normalized: string
  const lastDot = cleaned.lastIndexOf('.')
  const lastComma = cleaned.lastIndexOf(',')

  if (lastDot === -1 && lastComma === -1) {
    normalized = cleaned
  } else if (lastDot === -1) {
    // Only commas. If exactly one comma with 1–2 trailing digits, it's
    // a decimal separator; otherwise treat all commas as thousands.
    const decimal =
      cleaned.split(',').length === 2 &&
      /^,\d{1,2}$/.test(cleaned.substring(lastComma))
    normalized = decimal
      ? cleaned.replace(',', '.')
      : cleaned.replace(/,/g, '')
  } else if (lastComma === -1) {
    // Only dots. Treat as decimal if last segment has 1–2 digits; else
    // treat all as thousand separators.
    const tailLen = cleaned.length - lastDot - 1
    if (tailLen <= 2) normalized = cleaned
    else normalized = cleaned.replace(/\./g, '')
  } else {
    // Both. The later separator is the decimal.
    if (lastDot > lastComma) {
      normalized = cleaned.replace(/,/g, '')
    } else {
      normalized = cleaned.replace(/\./g, '').replace(',', '.')
    }
  }

  const n = Number(normalized)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

// ---------------------------------------------------------------------------
// Meta + DOM helpers
// ---------------------------------------------------------------------------

function metaContent($: CheerioAPI, property: string): string | null {
  const v = $(`meta[property="${property}"]`).attr('content')
  return v ? v.trim() || null : null
}

// Schema.org microdata fallback — for sites that use HTML-attribute
// markup instead of JSON-LD (Salesforce Commerce Cloud / Demandware
// storefronts like dwr.com, hermanmiller.com, and a long tail of older
// big-box e-commerce). When a [itemscope][itemtype*=Product] wrapper
// exists, we scope our search to its descendants (so we don't pick up
// itemprops from a related-products carousel rendered elsewhere on
// the page); we *do* descend into nested itemscopes like Offer so we
// can find offer.price inside the product. Document order picks the
// main product's name before brand.name. If no Product scope exists,
// falls back to a doc-wide search.
function microdataValue($: CheerioAPI, prop: string): string | null {
  const product = $('[itemscope][itemtype*="schema.org/Product"]').first()
  const el = product.length
    ? product.find(`[itemprop="${prop}"]`).first()
    : $(`[itemprop="${prop}"]`).first()
  if (!el.length) return null
  const tag = ((el[0] as { tagName?: string } | undefined)?.tagName ?? '').toLowerCase()
  let v: string | undefined
  if (tag === 'meta') v = el.attr('content')
  else if (tag === 'link') v = el.attr('href')
  else if (tag === 'img') v = el.attr('src')
  else v = el.attr('content') ?? el.text()
  const trimmed = v?.trim()
  return trimmed ? trimmed : null
}

function metaName($: CheerioAPI, name: string): string | null {
  const v = $(`meta[name="${name}"]`).attr('content')
  return v ? v.trim() || null : null
}

function cleanTitle(s: string): string | null {
  const trimmed = s.replace(/\s+/g, ' ').trim()
  return trimmed || null
}

function trimMax(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s
}

// ---------------------------------------------------------------------------
// __NEXT_DATA__ extraction
// ---------------------------------------------------------------------------
//
// Next.js stores SSR/hydration data in <script id="__NEXT_DATA__"> as JSON.
// Field layouts vary wildly between storefronts (Williams-Sonoma vs Shopify
// vs custom), so we walk the tree breadth-first looking for the first
// node that "looks like" a product object — name (string) plus any of
// price / images / image / sku — and pull standard fields out of that.
// First match wins; deeper nodes are unreachable behind shallower ones.

function extractFromNextData($: CheerioAPI): Partial<ScrapedProduct> {
  const raw = $('script#__NEXT_DATA__').first().contents().text()
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  const node = findProductNode(parsed)
  if (!node) return {}
  return {
    name: pickFirstString(node, ['name', 'productName', 'title', 'displayName']),
    image_url: pickImageUrl(node),
    retail_price_cents: pickPriceCents(node),
    description: pickFirstString(node, [
      'description',
      'longDescription',
      'shortDescription',
      'productDescription',
    ]),
    vendor: pickFirstString(node, ['brand', 'brandName', 'vendor', 'manufacturer']),
  }
}

function findProductNode(root: unknown): Record<string, unknown> | null {
  const queue: unknown[] = [root]
  let safety = 5000 // bounded BFS — huge __NEXT_DATA__ blobs shouldn't lock us up
  while (queue.length && safety-- > 0) {
    const cur = queue.shift()
    if (!cur || typeof cur !== 'object') continue
    if (Array.isArray(cur)) {
      for (const v of cur) queue.push(v)
      continue
    }
    const rec = cur as Record<string, unknown>
    const name = firstStringValue(rec, ['name', 'productName', 'title', 'displayName'])
    const hasPriceish =
      hasKey(rec, ['price', 'priceCents', 'salePrice', 'priceAmount', 'minPrice', 'currentPrice'])
    const hasImageish = hasKey(rec, ['image', 'images', 'imageUrl', 'mainImage', 'thumbnail'])
    if (name && name.length > 2 && (hasPriceish || hasImageish)) {
      return rec
    }
    for (const v of Object.values(rec)) {
      if (v && typeof v === 'object') queue.push(v)
    }
  }
  return null
}

function hasKey(rec: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((k) => rec[k] != null)
}

function firstStringValue(rec: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = rec[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

function pickFirstString(rec: Record<string, unknown>, keys: string[]): string | null {
  const v = firstStringValue(rec, keys)
  return v
}

function pickImageUrl(rec: Record<string, unknown>): string | null {
  for (const key of ['image', 'imageUrl', 'mainImage', 'thumbnail']) {
    const v = rec[key]
    const url = coerceImageUrl(v)
    if (url) return url
  }
  const imgs = rec['images']
  if (Array.isArray(imgs)) {
    for (const item of imgs) {
      const url = coerceImageUrl(item)
      if (url) return url
    }
  }
  return null
}

function coerceImageUrl(v: unknown): string | null {
  if (typeof v === 'string' && v.trim().startsWith('http')) return v.trim()
  if (v && typeof v === 'object') {
    const rec = v as Record<string, unknown>
    for (const k of ['url', 'src', 'href', 'contentUrl', 'large', 'full']) {
      const inner = rec[k]
      if (typeof inner === 'string' && inner.trim().startsWith('http')) return inner.trim()
    }
  }
  return null
}

function pickPriceCents(rec: Record<string, unknown>): number | null {
  // Direct cents value (common in normalized catalogs).
  for (const k of ['priceCents', 'priceInCents', 'salePriceCents']) {
    const v = rec[k]
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.round(v)
  }
  // Price-like fields parsed via the shared parser. Prefer sale price.
  const candidates: unknown[] = [
    rec['salePrice'],
    rec['currentPrice'],
    rec['offerPrice'],
    rec['price'],
    rec['priceAmount'],
    rec['minPrice'],
    rec['listPrice'],
  ]
  // Nested {amount, currency} or {value, currency} shapes.
  for (const k of ['price', 'salePrice', 'currentPrice']) {
    const v = rec[k]
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = v as Record<string, unknown>
      candidates.push(inner.amount, inner.value, inner.raw, inner.formatted)
    }
  }
  for (const c of candidates) {
    const cents = parsePriceToCents(c)
    if (cents != null && cents > 0) return cents
  }
  return null
}
