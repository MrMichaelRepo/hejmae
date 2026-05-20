// AI matching pass for bank-statement transactions.
//
// Given the parsed bank rows for an import, find candidate expense/payment
// rows in the same date window (±7 days, ±1% amount tolerance), then ask
// Claude Haiku to pick the most likely match for each bank txn (or say
// "no good match"). The model also returns a short reasoning string and a
// 0–1 confidence we surface in the review UI.
//
// Soft-fail: if ANTHROPIC_API_KEY isn't set, the matcher seeds proposals
// from a deterministic heuristic (closest absolute amount within window)
// so the UI still gets something useful — Claude is the upgrade path.

import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/lib/env'
import { supabaseAdmin } from '@/lib/supabase/server'
import type {
  BankTransactionRow,
  ExpenseRow,
  PaymentRow,
} from '@/lib/supabase/types'

const MODEL = 'claude-haiku-4-5-20251001'
// How many bank txns we hand to the model per API call. Haiku handles
// reasonably large prompts but we batch to keep latency / cost predictable
// and to fail fast on a bad call.
const BATCH_SIZE = 30
// Date window for candidate matches.
const DATE_WINDOW_DAYS = 7

interface CandidateExpense {
  id: string
  date: string
  vendor: string | null
  description: string | null
  amount_cents: number
}

interface CandidatePayment {
  id: string
  date: string
  amount_cents: number
  invoice_id: string
}

interface MatchProposal {
  bank_txn_id: string
  entity_type: 'expense' | 'payment' | null
  entity_id: string | null
  confidence: number
  reasoning: string
}

function shiftDate(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function fetchCandidates(
  designerId: string,
  bankTxns: BankTransactionRow[],
): Promise<{ expenses: CandidateExpense[]; payments: CandidatePayment[] }> {
  if (bankTxns.length === 0) return { expenses: [], payments: [] }
  const sb = supabaseAdmin()
  const minDate = shiftDate(
    bankTxns.reduce((a, b) => (a < b.txn_date ? a : b.txn_date), bankTxns[0].txn_date),
    -DATE_WINDOW_DAYS,
  )
  const maxDate = shiftDate(
    bankTxns.reduce((a, b) => (a > b.txn_date ? a : b.txn_date), bankTxns[0].txn_date),
    DATE_WINDOW_DAYS,
  )

  const [expRes, payRes] = await Promise.all([
    sb
      .from('expenses')
      .select('id, expense_date, vendor_name, description, amount_cents')
      .eq('designer_id', designerId)
      .gte('expense_date', minDate)
      .lte('expense_date', maxDate),
    sb
      .from('payments')
      .select('id, received_at, amount_cents, invoice_id')
      .eq('designer_id', designerId)
      .gte('received_at', minDate + 'T00:00:00')
      .lte('received_at', maxDate + 'T23:59:59'),
  ])
  if (expRes.error) throw expRes.error
  if (payRes.error) throw payRes.error

  const expenses: CandidateExpense[] = (expRes.data ?? []).map((e) => ({
    id: (e as ExpenseRow).id,
    date: (e as ExpenseRow).expense_date,
    vendor: (e as ExpenseRow).vendor_name,
    description: (e as ExpenseRow).description,
    amount_cents: (e as ExpenseRow).amount_cents,
  }))
  const payments: CandidatePayment[] = (payRes.data ?? []).map((p) => ({
    id: (p as PaymentRow).id,
    date: (p as PaymentRow).received_at.slice(0, 10),
    amount_cents: (p as PaymentRow).amount_cents,
    invoice_id: (p as PaymentRow).invoice_id,
  }))
  return { expenses, payments }
}

// ---------------------------------------------------------------------------
// Deterministic fallback when Anthropic isn't configured
// ---------------------------------------------------------------------------

function heuristicMatch(
  bank: BankTransactionRow,
  expenses: CandidateExpense[],
  payments: CandidatePayment[],
): MatchProposal {
  const wantAmount = Math.abs(bank.amount_cents)
  const isOutflow = bank.amount_cents < 0
  const candidates = isOutflow
    ? expenses.map((e) => ({ kind: 'expense' as const, id: e.id, amount: e.amount_cents, date: e.date }))
    : payments.map((p) => ({ kind: 'payment' as const, id: p.id, amount: p.amount_cents, date: p.date }))
  // Best by exact amount + nearest date.
  let best: { kind: 'expense' | 'payment'; id: string; amount: number; date: string } | null = null
  let bestScore = -Infinity
  for (const c of candidates) {
    if (Math.abs(c.amount - wantAmount) > Math.round(wantAmount * 0.01)) continue
    const dateDiff = Math.abs(
      (new Date(c.date).getTime() - new Date(bank.txn_date).getTime()) / 86400000,
    )
    const score = 1 - dateDiff / DATE_WINDOW_DAYS
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  if (!best) {
    return {
      bank_txn_id: bank.id,
      entity_type: null,
      entity_id: null,
      confidence: 0,
      reasoning: 'No expense or payment within ±7 days at this amount.',
    }
  }
  return {
    bank_txn_id: bank.id,
    entity_type: best.kind,
    entity_id: best.id,
    confidence: Math.max(0.5, bestScore),
    reasoning: 'Heuristic match (exact amount, nearest date).',
  }
}

// ---------------------------------------------------------------------------
// AI matching
// ---------------------------------------------------------------------------

function buildPrompt(
  bankTxns: BankTransactionRow[],
  expenses: CandidateExpense[],
  payments: CandidatePayment[],
): string {
  return [
    'You are reconciling bank-statement transactions against a small interior design studio\'s books.',
    '',
    'For each BANK transaction, pick the single best matching CANDIDATE expense (for outflows) or payment (for inflows), or say none matches.',
    'Use the BANK amount and description to find the match. Reasonable evidence:',
    ' - Amount matches exactly or within 1%.',
    ' - Vendor/payee in the bank description matches the vendor name on an expense (typo-tolerant).',
    ' - Date is within a few days.',
    'Never invent ids. If no candidate fits, return entity_id=null, confidence=0.',
    '',
    'Return STRICT JSON only — an array of objects, one per BANK transaction, in the same order. Schema:',
    '[{"bank_txn_id":"<uuid>","entity_type":"expense"|"payment"|null,"entity_id":"<uuid>|null","confidence":0.0..1.0,"reasoning":"<one short sentence>"}]',
    '',
    `BANK transactions (${bankTxns.length}):`,
    JSON.stringify(
      bankTxns.map((b) => ({
        id: b.id,
        date: b.txn_date,
        description: b.description,
        amount_cents: b.amount_cents,
      })),
    ),
    '',
    `CANDIDATE expenses (${expenses.length}):`,
    JSON.stringify(expenses),
    '',
    `CANDIDATE payments (${payments.length}):`,
    JSON.stringify(payments),
  ].join('\n')
}

function extractJsonArray(text: string): unknown[] | null {
  // Find the first '[' and the matching ']'.
  const start = text.indexOf('[')
  if (start < 0) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '[') depth++
    else if (text[i] === ']') {
      depth--
      if (depth === 0) {
        const slice = text.slice(start, i + 1)
        try {
          const v = JSON.parse(slice)
          return Array.isArray(v) ? v : null
        } catch {
          return null
        }
      }
    }
  }
  return null
}

async function callAi(
  bankBatch: BankTransactionRow[],
  expenses: CandidateExpense[],
  payments: CandidatePayment[],
): Promise<MatchProposal[]> {
  const apiKey = env.anthropicApiKey()
  if (!apiKey) return bankBatch.map((b) => heuristicMatch(b, expenses, payments))
  const client = new Anthropic({ apiKey })
  let res: Anthropic.Messages.Message
  try {
    res = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: buildPrompt(bankBatch, expenses, payments),
        },
      ],
    })
  } catch (e) {
    console.error('[banking.aiMatch] anthropic call failed, falling back', e)
    return bankBatch.map((b) => heuristicMatch(b, expenses, payments))
  }
  const text = res.content
    .filter((c): c is Anthropic.Messages.TextBlock => c.type === 'text')
    .map((c) => c.text)
    .join('\n')
  const arr = extractJsonArray(text)
  if (!arr) {
    console.error('[banking.aiMatch] failed to parse model response', text.slice(0, 500))
    return bankBatch.map((b) => heuristicMatch(b, expenses, payments))
  }
  // Validate ids back against the candidate sets to defeat hallucinations.
  const expIds = new Set(expenses.map((e) => e.id))
  const payIds = new Set(payments.map((p) => p.id))
  const proposals: MatchProposal[] = []
  for (const raw of arr) {
    const r = raw as Partial<MatchProposal>
    if (!r.bank_txn_id) continue
    let entity_type: 'expense' | 'payment' | null = null
    let entity_id: string | null = null
    if (r.entity_type === 'expense' && r.entity_id && expIds.has(r.entity_id)) {
      entity_type = 'expense'
      entity_id = r.entity_id
    } else if (r.entity_type === 'payment' && r.entity_id && payIds.has(r.entity_id)) {
      entity_type = 'payment'
      entity_id = r.entity_id
    }
    proposals.push({
      bank_txn_id: r.bank_txn_id,
      entity_type,
      entity_id,
      confidence: clamp(Number(r.confidence ?? 0)),
      reasoning: typeof r.reasoning === 'string' ? r.reasoning.slice(0, 400) : '',
    })
  }
  // Backfill any txn the model omitted.
  for (const b of bankBatch) {
    if (!proposals.find((p) => p.bank_txn_id === b.id)) {
      proposals.push(heuristicMatch(b, expenses, payments))
    }
  }
  return proposals
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

// ---------------------------------------------------------------------------
// Public: run matching pass for an entire import.
// ---------------------------------------------------------------------------

export async function runMatchingPass(
  designerId: string,
  importId: string,
): Promise<{ processed: number; matched: number }> {
  const sb = supabaseAdmin()
  await sb
    .from('bank_statement_imports')
    .update({ status: 'matching', ai_error: null })
    .eq('id', importId)
    .eq('designer_id', designerId)

  try {
    const { data: txns, error } = await sb
      .from('bank_transactions')
      .select('*')
      .eq('designer_id', designerId)
      .eq('import_id', importId)
      .eq('status', 'pending')
      .order('txn_date', { ascending: true })
    if (error) throw error
    const all = (txns ?? []) as BankTransactionRow[]
    if (all.length === 0) {
      await sb
        .from('bank_statement_imports')
        .update({ status: 'matched' })
        .eq('id', importId)
      return { processed: 0, matched: 0 }
    }
    const { expenses, payments } = await fetchCandidates(designerId, all)

    let matched = 0
    for (let i = 0; i < all.length; i += BATCH_SIZE) {
      const batch = all.slice(i, i + BATCH_SIZE)
      const proposals = await callAi(batch, expenses, payments)
      for (const p of proposals) {
        await sb
          .from('bank_transactions')
          .update({
            proposed_entity_type: p.entity_type,
            proposed_entity_id: p.entity_id,
            proposed_confidence: p.confidence,
            proposed_reasoning: p.reasoning,
          })
          .eq('id', p.bank_txn_id)
          .eq('designer_id', designerId)
        if (p.entity_id) matched++
      }
    }

    await sb
      .from('bank_statement_imports')
      .update({ status: 'matched', matched_count: matched })
      .eq('id', importId)
    return { processed: all.length, matched }
  } catch (e) {
    await sb
      .from('bank_statement_imports')
      .update({
        status: 'failed',
        ai_error: (e as Error).message.slice(0, 1000),
      })
      .eq('id', importId)
    throw e
  }
}
