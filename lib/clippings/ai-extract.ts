// AI verifier for product extraction. Unlike the previous "extract from
// scratch" design, this version is a *check-and-correct* pass that
// takes the deterministic baseline + closed picklists and asks the
// model to verify each field. Three guarantees we get from this shape:
//
//   1. Image URL is picked from a candidate list assembled from the
//      HTML, so the model can't hallucinate a 404'ing URL.
//   2. Brand / vendor are picked from the existing catalog's
//      vocabulary first — same product clipped twice produces the
//      same spelling, which makes "filter by brand" actually work.
//   3. item_type is picked from a closed taxonomy, so the dashboard
//      chips don't gradually fork into "Sconce" / "Wall sconce" /
//      "Wall lamp" synonyms.
//
// Every field comes back with a confidence flag. run-scrape uses that
// flag to decide whether to overwrite the deterministic baseline.
//
// Cost shape: Haiku 4.5, ~80–150 KB of pre-shrunk HTML in, ~400 tokens
// out. Roughly $0.005–$0.01 per call. Catalog dedup means we only pay
// once per unique product.
//
// Soft-fails on any error — the row keeps whatever the deterministic
// scraper found.

import Anthropic from '@anthropic-ai/sdk'
import { load, type CheerioAPI } from 'cheerio'
import { env } from '@/lib/env'
import { parsePriceToCents, type ScrapedProduct, type ExtractionCandidates } from './scrape'

const MODEL = 'claude-haiku-4-5-20251001'
const MAX_HTML_CHARS = 120_000

// Closed taxonomy for item_type. The AI must pick from this list or
// return null — keeps dashboard / filter UX consistent. Extend
// thoughtfully; every new entry is a forever entry.
export const ITEM_TYPE_TAXONOMY = [
  'Sconce',
  'Pendant light',
  'Chandelier',
  'Floor lamp',
  'Table lamp',
  'Flush mount',
  'Lounge chair',
  'Accent chair',
  'Dining chair',
  'Office chair',
  'Bar stool',
  'Sofa',
  'Sectional',
  'Loveseat',
  'Bench',
  'Stool',
  'Ottoman',
  'Coffee table',
  'Side table',
  'Console table',
  'Dining table',
  'Desk',
  'Bed',
  'Nightstand',
  'Dresser',
  'Bookshelf',
  'Cabinet',
  'Sideboard',
  'Rug',
  'Mirror',
  'Wall art',
  'Vase',
  'Planter',
  'Throw pillow',
  'Throw blanket',
  'Outdoor seating',
  'Outdoor table',
  'Outdoor sofa',
] as const

export type ConfidenceLevel = 'high' | 'low'

export interface AiField<T> {
  value: T | null
  confidence: ConfidenceLevel
}

export interface AiExtractedProduct {
  name: AiField<string>
  brand: AiField<string>
  vendor: AiField<string>
  image_url: AiField<string>
  retail_price_cents: AiField<number>
  description: AiField<string>
  item_type: AiField<string>
  material: AiField<string>
  style_tag: AiField<string>
}

export interface AiExtractInput {
  url: string
  html: string
  baseline: ScrapedProduct
  candidates: ExtractionCandidates
  // Existing catalog vocabulary so brand/vendor normalize to the
  // spellings already in use. Empty arrays are fine — the model just
  // picks freely from the page in that case.
  existingBrands: string[]
  existingVendors: string[]
}

export async function aiExtractProduct(
  input: AiExtractInput,
): Promise<AiExtractedProduct | null> {
  const apiKey = env.anthropicApiKey()
  if (!apiKey) {
    console.log('[clippings.aiExtract] skipped: ANTHROPIC_API_KEY not set')
    return null
  }

  const cleaned = stripForAi(input.html)
  if (!cleaned) return null

  const client = new Anthropic({ apiKey })

  let res: Anthropic.Messages.Message
  try {
    res = await client.messages.create({
      model: MODEL,
      max_tokens: 800,
      messages: [
        {
          role: 'user',
          content: buildPrompt(input, cleaned),
        },
      ],
    })
  } catch (err) {
    console.error('[clippings.aiExtract] anthropic call failed', err)
    return null
  }

  const text = res.content
    .filter((c): c is Anthropic.Messages.TextBlock => c.type === 'text')
    .map((c) => c.text)
    .join('\n')
    .trim()
  if (!text) {
    console.log('[clippings.aiExtract] empty response from model')
    return null
  }

  const json = extractJsonObject(text)
  if (!json) {
    console.log('[clippings.aiExtract] failed to parse JSON from response', {
      rawSample: text.slice(0, 500),
    })
    return null
  }

  const result = parseAiFields(json, input)

  console.log(
    '[clippings.aiExtract]',
    JSON.stringify({
      url: input.url,
      baseline_present: snapshotPresence(input.baseline),
      candidates_counts: {
        image_urls: input.candidates.image_urls.length,
        existing_brands: input.existingBrands.length,
        existing_vendors: input.existingVendors.length,
      },
      result: snapshotResult(result),
      usage: res.usage,
    }),
  )

  return result
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildPrompt(input: AiExtractInput, cleaned: string): string {
  const { url, baseline, candidates, existingBrands, existingVendors } = input

  return `You are verifying product data for an interior-design "moodboard" tool. We have already extracted a baseline from the page deterministically; your job is to confirm each field if correct, replace it if wrong, or null it if you cannot tell.

URL: ${url}

DETERMINISTIC BASELINE (verify each field):
${JSON.stringify(
  {
    name: baseline.name,
    brand: baseline.brand,
    vendor: baseline.vendor,
    image_url: baseline.image_url,
    retail_price_cents: baseline.retail_price_cents,
    description: baseline.description,
    item_type: baseline.item_type,
  },
  null,
  2,
)}

IMAGE CANDIDATES — pick exactly one URL from this list, or null. Do NOT invent a URL not in the list:
${formatList(candidates.image_urls)}

ITEM TYPE TAXONOMY — pick exactly one from this list, or null. Do NOT invent new categories:
${formatList(ITEM_TYPE_TAXONOMY as unknown as string[])}

EXISTING CATALOG BRANDS — prefer to reuse one of these spellings if it matches the page's brand. Only introduce a new brand if none of these match:
${formatList(existingBrands.length ? existingBrands : ['(catalog is empty — choose freely)'])}

EXISTING CATALOG VENDORS — prefer to reuse one of these spellings if it matches the retailer. Only introduce a new vendor if none match:
${formatList(existingVendors.length ? existingVendors : ['(catalog is empty — choose freely)'])}

Return ONLY a JSON object — no prose, no code fence. Every field has shape {"value": <T|null>, "confidence": "high"|"low"}. Use "low" when you're uncertain or working from sparse data; use "high" only when the page makes it unambiguous.

Schema:
{
  "name":        { "value": string|null, "confidence": "high"|"low" },  // Cleaned product name. Strip variant tails (color/size/SKU) and trailing site/brand suffixes. Title case. Target 2–6 words, max ~40 chars. Examples: "Hooked Wall Sconce" (not "HOOKED WALL / CROSS / SMALL / STONE"), "Remmy Swivel Armchair" (not "Remmy Upholstered Petite Swivel Armchair, Polyester Wrapped Cushions, Performance Heathered Tweed Knoll Gray").
  "brand":       { "value": string|null, "confidence": "high"|"low" },  // Manufacturer or designer brand (e.g. "Gubi", "Vitra", "Hay"). For direct-to-consumer retailers (Pottery Barn, Rejuvenation, West Elm, CB2, Crate & Barrel), the brand IS the retailer — return their proper name. Never return a hostname like "rejuvenation.com" or an all-caps slug.
  "vendor":      { "value": string|null, "confidence": "high"|"low" },  // Retailer / where-to-buy. ONLY set when it's different from the brand. For DTC sites where brand == retailer, return null.
  "image_url":   { "value": string|null, "confidence": "high"|"low" },  // The main product image URL. MUST be exactly one of the IMAGE CANDIDATES above, or null. Never invent.
  "price":       { "value": number|null, "confidence": "high"|"low" },  // Current retail price in the page's currency as a plain number (e.g. 1299.00). Prefer SALE price over list. null if not derivable.
  "description": { "value": string|null, "confidence": "high"|"low" },  // 1–3 sentence description, plain text, no HTML.
  "item_type":   { "value": string|null, "confidence": "high"|"low" },  // MUST be exactly one of the ITEM TYPE TAXONOMY entries above, or null. Never invent.
  "material":    { "value": string|null, "confidence": "high"|"low" },  // Dominant material OR style cue, one short phrase. Examples: "Performance tweed", "Solid walnut", "Brushed brass", "Travertine", "Boucle". Derive from the description when the page doesn't state it directly. Do not list multiple materials.
  "style_tag":   { "value": string|null, "confidence": "high"|"low" }   // Design-style label, one short phrase. Examples: "Mid-century modern", "Scandinavian", "Industrial", "Art deco", "Boho", "Minimalist", "Traditional", "Coastal", "Farmhouse", "Japandi". Pick the single dominant style or null. Used for catalog search filtering — keep it broad and reusable, not page-specific marketing copy.
}

Rules:
- Do not return placeholder text or invented values. When in doubt, return null with "low" confidence.
- For image_url and item_type specifically: returning a value NOT in the provided list is always wrong — null is better.
- For brand and vendor: prefer reusing an existing catalog spelling above when the page's brand matches one (case-insensitively or with minor variation). Only introduce a new spelling if none of the existing options fit.

HTML:
${cleaned}`
}

function formatList(items: string[]): string {
  if (!items.length) return '(none)'
  return items.map((s, i) => `  ${i + 1}. ${s}`).join('\n')
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseAiFields(
  json: Record<string, unknown>,
  input: AiExtractInput,
): AiExtractedProduct {
  const imageWhitelist = new Set(input.candidates.image_urls)
  const typeWhitelist = new Set<string>(ITEM_TYPE_TAXONOMY as unknown as string[])

  return {
    name: parseStringField(json.name),
    brand: parseStringField(json.brand),
    vendor: parseStringField(json.vendor),
    // Image must be a member of the candidate list. Model occasionally
    // ignores the constraint — we enforce it here.
    image_url: parseStringField(json.image_url, (v) =>
      imageWhitelist.has(v) ? v : null,
    ),
    retail_price_cents: parsePriceField(json.price),
    description: parseStringField(json.description),
    // Same closed-list enforcement for item_type.
    item_type: parseStringField(json.item_type, (v) =>
      typeWhitelist.has(v) ? v : null,
    ),
    material: parseStringField(json.material),
    style_tag: parseStringField(json.style_tag),
  }
}

function parseStringField(
  raw: unknown,
  transform?: (v: string) => string | null,
): AiField<string> {
  if (!raw || typeof raw !== 'object') return { value: null, confidence: 'low' }
  const rec = raw as Record<string, unknown>
  const rawValue = rec.value
  const rawConfidence = rec.confidence
  const confidence: ConfidenceLevel = rawConfidence === 'high' ? 'high' : 'low'
  if (typeof rawValue !== 'string') return { value: null, confidence }
  const trimmed = rawValue.trim()
  if (!trimmed) return { value: null, confidence }
  const final = transform ? transform(trimmed) : trimmed
  return { value: final, confidence }
}

function parsePriceField(raw: unknown): AiField<number> {
  if (!raw || typeof raw !== 'object') return { value: null, confidence: 'low' }
  const rec = raw as Record<string, unknown>
  const confidence: ConfidenceLevel = rec.confidence === 'high' ? 'high' : 'low'
  const cents = parsePriceToCents(rec.value)
  if (cents == null || cents <= 0) return { value: null, confidence }
  return { value: cents, confidence }
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// HTML pre-shrink
// ---------------------------------------------------------------------------
//
// Goal: feed the model the regions of the page that actually contain
// product information, not the navigation/footer/recommendation
// noise. Extracted in priority order, concatenated, capped at
// MAX_HTML_CHARS. The model spends its attention budget on judgment
// rather than search, and we fit harder pages in the same window.

function stripForAi(html: string): string {
  try {
    const $ = load(html)
    $('script:not([type="application/ld+json"]):not([id="__NEXT_DATA__"]),style,noscript,svg,iframe,template').remove()
    $('link[rel="preload"],link[rel="prefetch"],link[rel="stylesheet"]').remove()
    $('nav,footer,header[role="banner"],aside,[role="navigation"]').remove()
    // Strip very chatty attributes that bloat tokens without helping
    // (class names, data-testid, style attrs). Keep alt + src + href +
    // itemprop because they ARE the extraction signal on microdata
    // sites.
    $('*').each((_, el) => {
      const attribs = (el as { attribs?: Record<string, string> }).attribs
      if (!attribs) return
      for (const key of Object.keys(attribs)) {
        if (
          key === 'class' ||
          key === 'style' ||
          key.startsWith('data-') &&
            key !== 'data-src' &&
            key !== 'data-original'
        ) {
          delete attribs[key]
        }
      }
    })

    const parts: string[] = []

    // JSON-LD blocks first — these are the single highest-signal
    // chunks on schema.org-emitting sites.
    $('script[type="application/ld+json"]').each((_, el) => {
      const c = $(el).contents().text().trim()
      if (c) parts.push(`<script type="application/ld+json">${c}</script>`)
    })

    // __NEXT_DATA__ — same role on Next.js sites.
    const nd = $('script#__NEXT_DATA__').first().contents().text().trim()
    if (nd) {
      // The full blob can be enormous. Truncate to a reasonable window
      // — the product node is almost always within the first ~40KB.
      const ndTrimmed = nd.length > 40_000 ? nd.slice(0, 40_000) : nd
      parts.push(`<script id="__NEXT_DATA__">${ndTrimmed}</script>`)
    }

    // Head meta — og:*, title, description.
    const headBits: string[] = []
    const title = $('title').first().text().trim()
    if (title) headBits.push(`<title>${title}</title>`)
    $('meta[property^="og:"],meta[name="description"],meta[property^="product:"],meta[name="twitter:"]').each(
      (_, el) => {
        const html = $.html(el)
        if (html) headBits.push(html)
      },
    )
    if (headBits.length) parts.push(headBits.join('\n'))

    // Product-scoped microdata subtree, if present.
    const productScope = $('[itemscope][itemtype*="schema.org/Product"]').first()
    if (productScope.length) {
      const h = $.html(productScope)
      if (h) parts.push(h)
    }

    // <main> as a generic fallback for the product body.
    const main = $('main').first()
    if (main.length) {
      const h = $.html(main)
      if (h) parts.push(h)
    } else {
      // No <main> — fall back to <body>. Last resort.
      const body = $('body').first()
      const h = body.length ? $.html(body) : $.root().html()
      if (h) parts.push(h)
    }

    let out = parts.join('\n\n')
    if (out.length > MAX_HTML_CHARS) out = out.slice(0, MAX_HTML_CHARS)
    return out
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function snapshotPresence(p: ScrapedProduct): Record<string, boolean> {
  return {
    name: p.name != null,
    brand: p.brand != null,
    vendor: p.vendor != null,
    image_url: p.image_url != null,
    retail_price_cents: p.retail_price_cents != null,
    description: p.description != null,
    item_type: p.item_type != null,
  }
}

function snapshotResult(r: AiExtractedProduct): Record<string, unknown> {
  const fields: (keyof AiExtractedProduct)[] = [
    'name',
    'brand',
    'vendor',
    'image_url',
    'retail_price_cents',
    'description',
    'item_type',
    'material',
    'style_tag',
  ]
  const out: Record<string, unknown> = {}
  for (const k of fields) {
    const f = r[k]
    out[k] = { present: f.value != null, confidence: f.confidence }
  }
  return out
}

// CheerioAPI re-export not needed publicly; suppress unused-import
// lint if cheerio's typing path changes.
export type { CheerioAPI }
