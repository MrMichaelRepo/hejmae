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
  vendor: string | null
  image_url: string | null
  retail_price_cents: number | null
  description: string | null
}

export async function aiExtractProduct(
  html: string,
  url: string,
): Promise<AiExtractedProduct | null> {
  const apiKey = env.anthropicApiKey()
  if (!apiKey) return null

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
  if (!text) return null

  const json = extractJsonObject(text)
  if (!json) return null

  return {
    name: pickStr(json, 'name'),
    vendor: pickStr(json, 'vendor'),
    image_url: pickHttpUrl(json, 'image_url'),
    retail_price_cents: pickPriceCents(json),
    description: pickStr(json, 'description'),
  }
}

function buildPrompt(url: string, cleaned: string): string {
  return `You are extracting product data from a single product-page HTML snapshot.

URL: ${url}

Return ONLY a JSON object — no prose, no code fence — with this schema:

{
  "name": string | null,            // product name as it appears on the page
  "vendor": string | null,          // brand or retailer (e.g. "Pottery Barn", "Rejuvenation")
  "image_url": string | null,       // absolute https URL of the main product image
  "price": number | null,           // current retail price in the page's currency, as a plain number (e.g. 1299.00). Prefer the SALE price if both list and sale are shown.
  "description": string | null      // 1–3 sentence product description, plain text, no HTML
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

function pickHttpUrl(rec: Record<string, unknown>, key: string): string | null {
  const v = pickStr(rec, key)
  if (!v) return null
  return v.startsWith('http://') || v.startsWith('https://') ? v : null
}

function pickPriceCents(rec: Record<string, unknown>): number | null {
  const cents = parsePriceToCents(rec['price'])
  return cents != null && cents > 0 ? cents : null
}
