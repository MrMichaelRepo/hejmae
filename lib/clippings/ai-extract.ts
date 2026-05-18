// AI fallback for product extraction. Runs from run-scrape *only* when
// deterministic scraping (JSON-LD + __NEXT_DATA__ + OG/meta) leaves
// critical fields (image, price, description) missing. Soft-fails on
// any error — the row keeps whatever the deterministic scraper found.
//
// Cost shape: Haiku 4.5, ~80–250 KB of stripped HTML in, ~300 tokens
// out. Ballpark $0.003–$0.006 per call. We only call it when needed,
// so structured-data sites (Crate&Barrel, Anthropologie, etc.) don't
// trigger it at all.

import Anthropic from '@anthropic-ai/sdk'
import { load } from 'cheerio'
import { env } from '@/lib/env'
import { parsePriceToCents } from './scrape'

const MODEL = 'claude-haiku-4-5-20251001'
const MAX_HTML_CHARS = 200_000

export interface AiExtractedProduct {
  name: string | null
  // Manufacturer / designer brand (e.g. "Gubi", "Vitra"). Display-only.
  brand: string | null
  // Retailer / where-to-buy (e.g. "Design Within Reach"). Null when the
  // brand IS the retailer (direct-to-consumer storefronts).
  vendor: string | null
  image_url: string | null
  retail_price_cents: number | null
  description: string | null
  // Short product-type label ("Lounge chair", "Sconce", "Sofa") for
  // the dashboard chip. AI-normalized — independent of any
  // category/itemType the page emits, which is often vendor-internal
  // taxonomy noise.
  item_type: string | null
  // Dominant material or style cue ("Performance tweed", "Solid
  // walnut", "Brushed brass"). One short phrase, not a list.
  material: string | null
}

export async function aiExtractProduct(
  html: string,
  url: string,
): Promise<AiExtractedProduct | null> {
  const apiKey = env.anthropicApiKey()
  if (!apiKey) {
    console.log('[clippings.aiExtract] skipped: ANTHROPIC_API_KEY not set')
    return null
  }

  const cleaned = stripForAi(html)
  if (!cleaned) return null

  const client = new Anthropic({ apiKey })

  let res: Anthropic.Messages.Message
  try {
    res = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      messages: [
        {
          role: 'user',
          content: buildPrompt(url, cleaned),
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
    console.log('[clippings.aiExtract] failed to parse JSON from response', { rawSample: text.slice(0, 500) })
    return null
  }

  const result: AiExtractedProduct = {
    name: pickStr(json, 'name'),
    brand: pickStr(json, 'brand'),
    vendor: pickStr(json, 'vendor'),
    image_url: pickAbsoluteUrl(json, 'image_url', url),
    retail_price_cents: pickPriceCents(json),
    description: pickStr(json, 'description'),
    item_type: pickStr(json, 'item_type'),
    material: pickStr(json, 'material'),
  }

  // Log what the model actually returned vs. what we kept, so we can
  // tell whether a missing field is the model's fault or ours.
  console.log('[clippings.aiExtract]', JSON.stringify({
    url,
    raw: {
      name: typeof json.name,
      brand: typeof json.brand,
      vendor: typeof json.vendor,
      image_url: typeof json.image_url === 'string' ? json.image_url.slice(0, 120) : null,
      price: json.price,
      description: typeof json.description === 'string',
    },
    accepted: {
      name: result.name != null,
      brand: result.brand != null,
      vendor: result.vendor != null,
      image_url: result.image_url != null,
      retail_price_cents: result.retail_price_cents,
      description: result.description != null,
      item_type: result.item_type,
      material: result.material,
    },
    usage: res.usage,
  }))

  return result
}

function buildPrompt(url: string, cleaned: string): string {
  return `You are extracting product data from a single product-page HTML snapshot for an interior-design "moodboard" tool. The user is curating furniture, lighting, and decor — they want clean, scannable cards, not the verbose marketing names retailers emit.

URL: ${url}

Return ONLY a JSON object — no prose, no code fence — with this schema:

{
  "name": string | null,            // Cleaned product name. Strip variant tails (color/size/SKU) and trailing site/brand suffixes. Title case. Target 2–6 words, max ~40 chars. Examples: "Hooked Wall Sconce" (not "HOOKED WALL / CROSS / SMALL / STONE"), "Remmy Swivel Armchair" (not "Remmy Upholstered Petite Swivel Armchair, Polyester Wrapped Cushions, Performance Heathered Tweed Knoll Gray").
  "brand": string | null,           // Manufacturer or designer brand of the product itself, NOT the website selling it (e.g. "Gubi", "Vitra", "Hay", "Buster + Punch"). For direct-to-consumer retailers selling their own line (Pottery Barn, West Elm, Rejuvenation, CB2), the brand IS the retailer — return their name. Avoid all-caps slugs like "BRANDS-GUBI".
  "vendor": string | null,          // Retailer / where to buy. ONLY set this when it's different from the brand — e.g. brand="Gubi", vendor="Design Within Reach". For direct-to-consumer storefronts where brand and seller are the same, return null.
  "image_url": string | null,       // Absolute https URL of the main product image.
  "price": number | null,           // Current retail price in the page's currency, as a plain number (e.g. 1299.00). Prefer SALE price if both list and sale are shown.
  "description": string | null,     // 1–3 sentence description, plain text, no HTML.
  "item_type": string | null,       // Short product-type label, 1–3 words, title case. The category a designer would file this under. Examples: "Lounge chair", "Sconce", "Pendant light", "Sofa", "Dining chair", "Side table", "Rug". Do NOT use retailer-internal slugs like "outdoor-lounge-chairs-ottomans" or "BRANDS-GUBI".
  "material": string | null         // Dominant material OR style cue as one short phrase. Pick whichever is more identifying. Examples: "Performance tweed", "Solid walnut", "Brushed brass", "Travertine", "Boucle". null if not derivable. Do not list multiple materials.
}

If a field can't be determined confidently, return null for it. Do not invent values. Do not return placeholder text.

HTML:
${cleaned}`
}

function stripForAi(html: string): string {
  try {
    const $ = load(html)
    $('script,style,noscript,svg,iframe,template').remove()
    // We keep the <head> because OG tags and <title> are useful, but
    // drop link/meta noise that doesn't help (icons, preload hints).
    $('link[rel="preload"],link[rel="prefetch"],link[rel="stylesheet"]').remove()
    const out = $.root().html() ?? ''
    return out.length > MAX_HTML_CHARS ? out.slice(0, MAX_HTML_CHARS) : out
  } catch {
    return ''
  }
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

function pickStr(rec: Record<string, unknown>, key: string): string | null {
  const v = rec[key]
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t : null
}

// Resolve whatever URL the model returned — relative, protocol-relative,
// or absolute — against the page URL. Models often hand back "//cdn..."
// or "/images/..." paths because that's what the HTML actually contains;
// dropping those was the silent failure mode that kept images blank.
function pickAbsoluteUrl(
  rec: Record<string, unknown>,
  key: string,
  baseUrl: string,
): string | null {
  const v = pickStr(rec, key)
  if (!v) return null
  try {
    const resolved = new URL(v, baseUrl).toString()
    return resolved.startsWith('http://') || resolved.startsWith('https://')
      ? resolved
      : null
  } catch {
    return null
  }
}

function pickPriceCents(rec: Record<string, unknown>): number | null {
  const cents = parsePriceToCents(rec['price'])
  return cents != null && cents > 0 ? cents : null
}
