// OpenAI client wrapper. Two callsites:
//   * describeImageForSearch — GPT-4o vision turns an uploaded image
//     into a text description tuned for product similarity search.
//   * embedText — text-embedding-3-small produces a 1536-dim vector
//     for both the query description and every catalog row.
//
// Both functions throw a clean HttpError when OPENAI_API_KEY isn't set
// so the calling route can surface a 503 (image-search route) or the
// background runner can swallow it (embedding generation).

import OpenAI from 'openai'
import { env } from '@/lib/env'
import { serverError } from '@/lib/errors'

let _client: OpenAI | null | undefined

function client(): OpenAI {
  if (_client) return _client
  const key = env.openaiApiKey()
  if (!key) {
    throw serverError('OpenAI not configured', { hint: 'OPENAI_API_KEY' })
  }
  _client = new OpenAI({ apiKey: key })
  return _client
}

export function isOpenAIConfigured(): boolean {
  return !!env.openaiApiKey()
}

export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMENSIONS = 1536
export const VISION_MODEL = 'gpt-4o'

// The prompt is intentionally short and constrains output style so the
// description is dense and embedding-friendly. Skipping brand names is
// deliberate: brand strings would bias the embedding toward vendor
// matches we already get from name/vendor text search.
const VISION_PROMPT = `Describe this interior design product for the purpose of finding similar items. Include: product type, material, color, style, approximate dimensions if visible, and notable design features. Be specific and concise. Do not include brand names.`

export async function describeImageForSearch(
  base64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
): Promise<string> {
  const res = await client().chat.completions.create({
    model: VISION_MODEL,
    max_tokens: 300,
    temperature: 0.2,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: VISION_PROMPT },
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64}` },
          },
        ],
      },
    ],
  })
  const text = res.choices[0]?.message?.content?.trim()
  if (!text) throw serverError('Vision model returned empty description')
  return text
}

export async function embedText(input: string): Promise<number[]> {
  const trimmed = input.trim()
  if (!trimmed) throw serverError('Cannot embed empty string')
  const res = await client().embeddings.create({
    model: EMBEDDING_MODEL,
    input: trimmed,
  })
  const vec = res.data[0]?.embedding
  if (!vec || vec.length !== EMBEDDING_DIMENSIONS) {
    throw serverError(
      `Embedding model returned ${vec?.length ?? 0} dims, expected ${EMBEDDING_DIMENSIONS}`,
    )
  }
  return vec
}
