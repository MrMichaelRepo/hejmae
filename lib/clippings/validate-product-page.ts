// Product-page validation: gate that runs in /api/clippings/clip before
// we touch the database or trigger a scrape. The goal is to bounce
// obvious non-products (Reddit threads, NYT articles, Pinterest boards)
// with a 422 so designers see "this isn't a product page" inline in the
// Clipper extension — and so we don't burn the scraper or pollute the
// catalog with junk rows.
//
// Verdict precedence:
//   1. URL on the editorial / social blocklist → reject
//   2. HEAD request unreachable → reject
//   3. og:type explicitly editorial OR no JSON-LD Product OR no price
//      pattern in body → reject
//   4. otherwise → ok
//
// Cheap stuff first (URL → HEAD → small HTML pre-scan) so we don't pull
// down megabytes from a page we were going to reject anyway.

import { load } from 'cheerio'

const USER_AGENT =
  'Mozilla/5.0 (compatible; HejmaeClipper/1.0; +https://hejmae.com/clipper)'

// Domains we know are editorial / social. Hostname must match the suffix
// (so www.nytimes.com and m.facebook.com are both caught).
const DOMAIN_BLOCKLIST = [
  'reddit.com',
  'pinterest.com',
  'pinterest.ca',
  'pinterest.co.uk',
  'instagram.com',
  'twitter.com',
  'x.com',
  'facebook.com',
  'nytimes.com',
  'architecturaldigest.com',
  'dezeen.com',
  'dwell.com',
  'apartmenttherapy.com',
  'theguardian.com',
  'medium.com',
  'youtube.com',
  'tiktok.com',
  'linkedin.com',
]

// og:type values that mean "definitely not a product." Anything starting
// with article.* / blog.* counts. og:type=product or product.* is fine;
// missing og:type leaves us to fall back to JSON-LD + price heuristics.
const EDITORIAL_OG_TYPES = new Set([
  'article',
  'blog',
  'website',
  'profile',
  'video',
  'video.other',
  'video.movie',
  'news.article',
])

// Match the most common currency markers + bare numeric prices. We're
// not parsing the price here — just confirming the page has price-like
// content somewhere. Loose by design: a false-positive lets a borderline
// page through; the scraper handles the case where it can't find one.
const PRICE_REGEX = /(?:[$£€¥₹]\s?\d|[\d,]+\s?(?:USD|EUR|GBP|CAD|AUD)\b|\bprice\b[^a-z]{0,40}\d)/i

// URL path patterns common across e-commerce. Hit on any of these and
// we treat the URL itself as a strong-enough signal that this is a
// product page — JSON-LD / og:type are optional. Anchored to path
// segments (\/.../\/) so /productsearch or /products-faq don't match.
const PRODUCT_URL_RE = /\/(?:products?|p|dp|item|sku|pdp|shop)\/[a-z0-9_-]/i

export type ProductPageVerdict =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; reason: string }

export async function validateProductPage(
  rawUrl: string,
  providedHtml?: string | null,
): Promise<ProductPageVerdict> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { ok: false, reason: 'Invalid URL.' }
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, reason: 'URL must be http(s).' }
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  if (DOMAIN_BLOCKLIST.some((d) => host === d || host.endsWith(`.${d}`))) {
    return { ok: false, reason: 'This page doesn\'t appear to be a product listing.' }
  }

  const urlLooksLikeProduct = PRODUCT_URL_RE.test(parsed.pathname)

  // Prefer the extension-provided rendered DOM. JS-rendered SPAs
  // (Pottery Barn, Rejuvenation, anything React-based) don't expose
  // JSON-LD or og:type in the server-side HTML, so a re-fetch from
  // Vercel will reject perfectly real product pages. The extension
  // already has the rendered page in front of the user — trust it.
  let html: string | null = providedHtml ?? null
  if (!html) {
    const headOk = await reachable(parsed.toString())
    if (!headOk) {
      return { ok: false, reason: 'Couldn\'t reach this page.' }
    }
    html = await fetchHtmlBounded(parsed.toString(), 256 * 1024)
    if (html == null) {
      return { ok: false, reason: 'Couldn\'t load this page.' }
    }
  }

  const verdict = inspectHtml(html, { urlLooksLikeProduct })
  if (!verdict.ok) return verdict
  return { ok: true, html, finalUrl: parsed.toString() }
}

// Public for unit-testing — inspectHtml does the deterministic part of
// the verdict given an HTML string. No network.
//
// Positive signal is ANY of:
//   - URL path matches a product pattern (/products/, /p/, /dp/, …)
//   - JSON-LD @type=Product / ItemPage
//   - og:type=product
// Modern JS-rendered e-commerce (Pottery Barn, Rejuvenation, etc.) often
// omits both JSON-LD and og:type — they rely on Google Merchant feeds
// instead. URL pattern is the most reliable positive signal in practice.
export function inspectHtml(
  html: string,
  opts: { urlLooksLikeProduct?: boolean } = {},
): ProductPageVerdict {
  const $ = load(html)

  const ogType = ($('meta[property="og:type"]').attr('content') ?? '').toLowerCase().trim()
  if (ogType && EDITORIAL_OG_TYPES.has(ogType)) {
    return { ok: false, reason: 'This page doesn\'t appear to be a product listing.' }
  }
  // Articles often advertise themselves with og:type=article.*
  if (ogType.startsWith('article') || ogType.startsWith('blog')) {
    return { ok: false, reason: 'This page doesn\'t appear to be a product listing.' }
  }

  const ldBlocks = $('script[type="application/ld+json"]')
    .map((_, el) => $(el).contents().text())
    .get()
  const hasProductLd = ldBlocks.some((raw) => containsProductLd(raw))
  const ogIsProduct = ogType === 'product' || ogType.startsWith('product.')
  // Schema.org microdata Product — covers Demandware / Salesforce
  // Commerce Cloud sites (dwr.com, hermanmiller.com, etc.) that don't
  // ship JSON-LD or og:type=product but do mark up the PDP with
  // itemtype attributes.
  const hasProductMicrodata =
    $('[itemscope][itemtype*="schema.org/Product"], [itemscope][itemtype*="schema.org/ItemPage"]')
      .length > 0

  const positiveSignal =
    hasProductLd ||
    ogIsProduct ||
    hasProductMicrodata ||
    opts.urlLooksLikeProduct === true
  if (!positiveSignal) {
    return { ok: false, reason: 'This page doesn\'t appear to be a product listing.' }
  }

  // Price-like content anywhere on the page. We strip script/style so
  // analytics blobs don't false-positive the regex.
  $('script,style,noscript').remove()
  const bodyText = $('body').text()
  if (!PRICE_REGEX.test(bodyText) && !PRICE_REGEX.test(html)) {
    return { ok: false, reason: 'This page doesn\'t appear to be a product listing.' }
  }

  return { ok: true, html, finalUrl: '' }
}

function containsProductLd(rawJson: string): boolean {
  // Cheap path: the @type string appears in the literal JSON. Avoids
  // throwing on malformed JSON-LD, which is depressingly common.
  const cheap = /"@type"\s*:\s*"?(Product|ItemPage)"?/i.test(rawJson)
  if (cheap) return true
  // Some sites emit arrays of @type. Try to parse, but soft-fail.
  try {
    const parsed = JSON.parse(rawJson) as unknown
    return ldHasProductType(parsed)
  } catch {
    return false
  }
}

function ldHasProductType(node: unknown): boolean {
  if (!node) return false
  if (Array.isArray(node)) return node.some(ldHasProductType)
  if (typeof node !== 'object') return false
  const rec = node as Record<string, unknown>
  const t = rec['@type']
  if (typeof t === 'string' && (t === 'Product' || t === 'ItemPage')) return true
  if (Array.isArray(t) && t.some((x) => x === 'Product' || x === 'ItemPage')) {
    return true
  }
  if (rec['@graph']) return ldHasProductType(rec['@graph'])
  return false
}

async function reachable(url: string): Promise<boolean> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 5000)
  try {
    const r = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: ac.signal,
      headers: { 'User-Agent': USER_AGENT },
    })
    // 405 (Method Not Allowed) is common — many product sites refuse
    // HEAD outright. Treat anything < 500 as reachable; we'll GET next.
    return r.status < 500
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function fetchHtmlBounded(
  url: string,
  maxBytes: number,
): Promise<string | null> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 10_000)
  try {
    const r = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ac.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!r.ok || !r.body) return null
    const ct = (r.headers.get('content-type') ?? '').toLowerCase()
    if (ct && !ct.includes('html') && !ct.includes('xml')) return null

    const reader = r.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (total < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      total += value.length
    }
    try {
      await reader.cancel()
    } catch {
      // ignore — cancellation after early exit is best-effort.
    }
    const merged = new Uint8Array(Math.min(total, maxBytes))
    let off = 0
    for (const c of chunks) {
      const slice = c.subarray(0, Math.min(c.length, maxBytes - off))
      merged.set(slice, off)
      off += slice.length
      if (off >= maxBytes) break
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(merged)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export const _internalForTests = { DOMAIN_BLOCKLIST, EDITORIAL_OG_TYPES, PRICE_REGEX, PRODUCT_URL_RE }
