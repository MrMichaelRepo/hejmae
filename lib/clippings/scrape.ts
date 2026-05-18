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
  // Manufacturer / designer brand (e.g. "Gubi"). Sourced from JSON-LD
  // `brand` and microdata. Display-only on the clipping card.
  brand: string | null
  // Retailer / where-to-buy (e.g. "Design Within Reach"). Sourced from
  // og:site_name / hostname. Used for trade-price lookup and items.vendor
  // on add-to-project. Stored on catalog_products, not on clipping_items.
  vendor: string | null
  image_url: string | null
  retail_price_cents: number | null
  description: string | null
  item_type: string | null
  // No deterministic source — only filled by the AI extractor. Kept
  // on this type so run-scrape can carry it through one merge struct.
  material: string | null
  // Design-style label (e.g. "Mid-century modern", "Scandinavian").
  // AI-only, like material. Background data for catalog search —
  // never displayed on the clipping card.
  style_tag: string | null
}

// Image URLs harvested from every signal we know how to read. Fed to
// the AI verifier as a closed picklist — it adjudicates instead of
// free-form extracting, which eliminates URL hallucination. Brand /
// vendor normalization is NOT done here — that's a catalog-level
// concern (pick from existing catalog brand spellings to stay
// consistent), handled in run-scrape.
export interface ExtractionCandidates {
  image_urls: string[]
}

export interface ScrapeResult {
  product: ScrapedProduct
  candidates: ExtractionCandidates
}

export function scrapeProductHtml(
  html: string,
  url: string,
  fallbackTitle?: string | null,
): ScrapeResult {
  const $ = load(html)
  const ld = collectJsonLdProducts($)
  // __NEXT_DATA__ from Next.js sites (Pottery Barn / Rejuvenation /
  // Williams-Sonoma family and most React storefronts). Cheap, no
  // network, plays the same role as JSON-LD for sites that just don't
  // emit schema.org markup.
  const nd = extractFromNextData($)
  const ndRoot = parseNextDataRoot($)

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
    nd.brand ??
    microdataValue($, 'brand')

  // Retailer: site_name (canonical) → URL hostname. We deliberately do
  // NOT fall back to `brand` here — they're different concepts.
  const vendor =
    metaContent($, 'og:site_name') ??
    vendorFromHostname(url)

  const itemType = pickStr(ld, 'category') ?? null

  return {
    product: {
      name: name ? trimMax(name, 300) : null,
      brand: brand ? trimMax(brand, 200) : null,
      vendor: vendor ? trimMax(vendor, 200) : null,
      image_url: image,
      retail_price_cents: price,
      description: description ? trimMax(description, 4000) : null,
      item_type: itemType ? trimMax(itemType, 100) : null,
      material: null,
      style_tag: null,
    },
    candidates: {
      image_urls: collectImageCandidates($, ld, nd, ndRoot, url),
    },
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
    brand: pickFirstString(node, ['brand', 'brandName', 'vendor', 'manufacturer']),
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

// Returns the parsed __NEXT_DATA__ root so candidate collectors can
// walk it for additional image / brand signals beyond the single
// product node `extractFromNextData` returned.
function parseNextDataRoot($: CheerioAPI): unknown {
  const raw = $('script#__NEXT_DATA__').first().contents().text()
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Candidate collectors for the AI verifier
// ---------------------------------------------------------------------------
//
// The AI extractor adjudicates among these instead of free-form
// extracting from the HTML. Two payoffs:
//   * Images: AI picks from a list — can't hallucinate a URL that 404s.
//   * Brands: AI picks from a list — can't invent "rejuvenation.com"
//     when the right answer is "Rejuvenation".

const MAX_CANDIDATES = 15

function collectImageCandidates(
  $: CheerioAPI,
  ld: LdProduct[],
  nd: Partial<ScrapedProduct>,
  ndRoot: unknown,
  baseUrl: string,
): string[] {
  const raw: (string | null | undefined)[] = []

  // og:image — the page's self-declared share image. Usually the hero.
  raw.push(metaContent($, 'og:image'))
  raw.push(metaContent($, 'og:image:secure_url'))
  raw.push(metaContent($, 'twitter:image'))

  // JSON-LD images. Walk every product entry; many sites emit a list.
  for (const p of ld) {
    const v = p['image']
    if (typeof v === 'string') raw.push(v)
    else if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === 'string') raw.push(item)
        else if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>
          if (typeof rec.url === 'string') raw.push(rec.url)
          if (typeof rec.contentUrl === 'string') raw.push(rec.contentUrl)
        }
      }
    } else if (v && typeof v === 'object') {
      const rec = v as Record<string, unknown>
      if (typeof rec.url === 'string') raw.push(rec.url)
      if (typeof rec.contentUrl === 'string') raw.push(rec.contentUrl)
    }
  }

  // Microdata.
  raw.push(microdataValue($, 'image'))

  // The single image __NEXT_DATA__ surfaced for the primary product.
  if (nd.image_url) raw.push(nd.image_url)

  // Walk __NEXT_DATA__ for image-shaped URLs everywhere — handles
  // multi-image carousels stored under `images: [{url}]`.
  walkForImageUrls(ndRoot, raw)

  // <img> tags. Cap how many we scan so giant DOMs (carousels +
  // recommendations + ad units) don't bloat the candidate list. The
  // first ~60 imgs almost always include the main product image.
  let scanned = 0
  $('img').each((_, el) => {
    if (scanned++ > 60) return
    const $el = $(el)
    const src = $el.attr('src') ?? $el.attr('data-src') ?? $el.attr('data-original')
    if (src) raw.push(src)
    // <img srcset="x.jpg 1x, x@2x.jpg 2x"> — take the highest descriptor.
    const srcset = $el.attr('srcset')
    if (srcset) raw.push(srcsetBest(srcset))
  })

  return normalizeUrlCandidates(raw, baseUrl)
}

function srcsetBest(srcset: string): string | null {
  // Each entry: "<url> <descriptor>". Pick the entry with the largest
  // width or density. Cheap parser — splits on commas not inside URLs.
  const entries = srcset.split(',').map((s) => s.trim()).filter(Boolean)
  if (!entries.length) return null
  let bestUrl: string | null = null
  let bestScore = -1
  for (const e of entries) {
    const parts = e.split(/\s+/)
    const u = parts[0]
    if (!u) continue
    const desc = parts[1] ?? ''
    const m = desc.match(/^(\d+(?:\.\d+)?)([wx])$/)
    const score = m ? parseFloat(m[1]!) : 0
    if (score > bestScore) {
      bestScore = score
      bestUrl = u
    }
  }
  return bestUrl
}

function walkForImageUrls(node: unknown, out: (string | null | undefined)[]): void {
  if (!node) return
  const queue: unknown[] = [node]
  let safety = 5000
  while (queue.length && safety-- > 0) {
    const cur = queue.shift()
    if (!cur || typeof cur !== 'object') continue
    if (Array.isArray(cur)) {
      for (const v of cur) queue.push(v)
      continue
    }
    const rec = cur as Record<string, unknown>
    for (const key of Object.keys(rec)) {
      const v = rec[key]
      const url = coerceImageUrlCandidate(v)
      if (url && /image|photo|thumbnail|asset/i.test(key)) out.push(url)
      if (v && typeof v === 'object') queue.push(v)
    }
  }
}

function coerceImageUrlCandidate(v: unknown): string | null {
  if (typeof v === 'string' && v.length < 2000) return v
  if (Array.isArray(v)) {
    for (const item of v) {
      const u = coerceImageUrlCandidate(item)
      if (u) return u
    }
  }
  if (v && typeof v === 'object') {
    const rec = v as Record<string, unknown>
    for (const k of ['url', 'src', 'href', 'contentUrl', 'large', 'full']) {
      const inner = rec[k]
      if (typeof inner === 'string' && inner.length < 2000) return inner
    }
  }
  return null
}

// Resolve, filter, dedupe. Keeps only http(s) URLs that look like
// images (extension or path hint). Caps the list so the AI prompt
// stays compact.
function normalizeUrlCandidates(
  raw: (string | null | undefined)[],
  baseUrl: string,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'string') continue
    const trimmed = r.trim()
    if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('javascript:')) continue
    let resolved: string
    try {
      resolved = new URL(trimmed, baseUrl).toString()
    } catch {
      continue
    }
    if (!/^https?:\/\//.test(resolved)) continue
    if (!looksLikeImageUrl(resolved)) continue
    if (seen.has(resolved)) continue
    seen.add(resolved)
    out.push(resolved)
    if (out.length >= MAX_CANDIDATES) break
  }
  return out
}

function looksLikeImageUrl(url: string): boolean {
  // Path or query that smells like an image. Permissive — CDN paths
  // often drop the extension. Excludes obvious non-image endpoints.
  if (/\.(jpe?g|png|webp|gif|avif|svg)(\?|$|#)/i.test(url)) return true
  if (/\/image[s]?\//i.test(url)) return true
  if (/cdn|media|akamaized|cloudfront|imgix|shopify|scene7|salsify|contentful/i.test(url)) return true
  // Reject obvious tracking pixels and analytics.
  if (/pixel|tracking|analytics|beacon|googletagmanager/i.test(url)) return false
  return false
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
