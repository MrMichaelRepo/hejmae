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

  const name =
    pickStr(ld, 'name') ??
    metaContent($, 'og:title') ??
    cleanTitle($('title').first().text()) ??
    fallbackTitle?.trim() ??
    null

  const description =
    pickStr(ld, 'description') ??
    metaContent($, 'og:description') ??
    metaName($, 'description') ??
    null

  const image =
    firstImageFromLd(ld) ??
    metaContent($, 'og:image') ??
    metaContent($, 'og:image:secure_url') ??
    null

  const price = priceFromLd(ld) ?? priceFromMeta($)

  const brand = pickStr(ld, 'brand') ?? brandFromLd(ld)
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
