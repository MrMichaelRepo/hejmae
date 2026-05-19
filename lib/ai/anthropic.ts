// Claude-drafted invoice / reminder emails for the Send modal.
//
// Soft-fails: if ANTHROPIC_API_KEY isn't set, callers fall back to the
// deterministic template prefill (lib/email/invoice-template.ts). The
// Send modal also keeps the ✨ "Rewrite with AI" button reactive on
// availability, so the studio never sees a dead button.

import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/lib/env'
import { formatCents, formatDate } from '@/lib/format'
import { sanitizeEmailHtml } from '@/lib/email/sanitize'
import { studioName, type DesignerBrand } from '@/lib/email/shell'
import type { EmailKind, EmailTone } from '@/lib/email/invoice-template'

const MODEL = 'claude-haiku-4-5-20251001'

export function isAnthropicConfigured(): boolean {
  return !!env.anthropicApiKey()
}

export interface DraftInvoiceEmailInput {
  brand: DesignerBrand
  client: { name: string }
  project: { name: string }
  invoice: {
    type: 'deposit' | 'progress' | 'final'
    total_cents: number
    notes?: string | null
    due_at?: string | null
    daysOverdue?: number | null
  }
  kind: EmailKind
  tone: EmailTone
}

export interface DraftInvoiceEmailResult {
  subject: string
  body_html: string
}

// Returns null if Anthropic is not configured or the call fails — callers
// should fall back to the deterministic template.
export async function draftInvoiceEmail(
  input: DraftInvoiceEmailInput,
): Promise<DraftInvoiceEmailResult | null> {
  const apiKey = env.anthropicApiKey()
  if (!apiKey) {
    console.log('[ai.draftInvoiceEmail] skipped: ANTHROPIC_API_KEY not set')
    return null
  }

  const client = new Anthropic({ apiKey })
  const prompt = buildPrompt(input)

  let res: Anthropic.Messages.Message
  try {
    res = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      // Lower temperature → more consistent, less "salesy" copy.
      temperature: 0.4,
      messages: [{ role: 'user', content: prompt }],
    })
  } catch (err) {
    console.error('[ai.draftInvoiceEmail] anthropic call failed', err)
    return null
  }

  const text = res.content
    .filter((c): c is Anthropic.Messages.TextBlock => c.type === 'text')
    .map((c) => c.text)
    .join('\n')
    .trim()
  if (!text) return null

  const parsed = parseModelOutput(text)
  if (!parsed) {
    console.warn('[ai.draftInvoiceEmail] could not parse model output', {
      sample: text.slice(0, 300),
    })
    return null
  }

  // Sanitize at the boundary — Claude is good but we don't trust raw HTML
  // from any model into an email body.
  return {
    subject: parsed.subject.trim().slice(0, 200),
    body_html: sanitizeEmailHtml(parsed.body_html),
  }
}

function buildPrompt(input: DraftInvoiceEmailInput): string {
  const studio = studioName(input.brand, 'the studio')
  const total = formatCents(input.invoice.total_cents)
  const due = input.invoice.due_at ? formatDate(input.invoice.due_at) : null
  const overdue =
    input.invoice.daysOverdue && input.invoice.daysOverdue > 0
      ? `${input.invoice.daysOverdue} days overdue`
      : null
  const toneNote =
    input.tone === 'warm'
      ? 'Friendly, personal, conversational — first-name basis.'
      : input.tone === 'professional'
        ? 'Cordial and businesslike. Polite, not stiff.'
        : 'Direct and matter-of-fact. Polite but firm.'

  const kindNote =
    input.kind === 'reminder'
      ? `This is a payment REMINDER for an invoice already sent. ${overdue ? `The invoice is ${overdue}.` : ''} Do not re-explain the invoice — just nudge.`
      : `This is the INITIAL invoice email. Briefly explain it's for the ${input.invoice.type} stage of the project.`

  return `You are drafting a transactional email from an interior designer to their client.

CONTEXT
- Studio name: ${studio}
- Client name: ${input.client.name}
- Project: ${input.project.name}
- Invoice total: ${total}
- Invoice kind: ${input.invoice.type}
${due ? `- Due date: ${due}` : ''}
${input.invoice.notes ? `- Designer's note to the client: ${input.invoice.notes}` : ''}

INSTRUCTIONS
- ${kindNote}
- Tone: ${toneNote}
- 3–5 short paragraphs total. Open with a greeting that uses the client's first name. Sign off with the studio name.
- Do NOT include a "Pay now" button, a URL, or the literal dollar amount as a heading — the system appends a pay button and total below your body automatically. You CAN mention the total once in the body if it reads naturally.
- Do NOT fabricate facts (no made-up dates, deliverables, or line items).
- Allowed HTML tags only: <p>, <strong>, <em>, <br>. Use inline style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#4a5068;" on each <p>. No other styles, no classes, no IDs.

OUTPUT FORMAT
Return a single JSON object on one line, no preamble, no code fence, with exactly two keys:
{"subject": "<subject line, max 80 chars>", "body_html": "<the paragraphs>"}`
}

function parseModelOutput(raw: string): { subject: string; body_html: string } | null {
  // Tolerate code fences and leading prose.
  const cleaned = raw
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```\s*$/g, '')
    .trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  const slice = cleaned.slice(start, end + 1)
  try {
    const obj = JSON.parse(slice) as Partial<{ subject: string; body_html: string }>
    if (typeof obj.subject !== 'string' || typeof obj.body_html !== 'string') return null
    return { subject: obj.subject, body_html: obj.body_html }
  } catch {
    return null
  }
}
