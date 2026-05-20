// Thin Helcim REST client.
//
// All requests authenticate with the designer's `api-token` header (per
// Helcim's docs) — we never use a single platform token because each
// designer is the merchant of record on their own Helcim account.
//
// NEEDS SANDBOX VERIFICATION: the exact field names + JSON shapes below
// reflect the Helcim v2 REST API as documented at devdocs.helcim.com as
// of writing. Verify against a sandbox before turning real payments on,
// particularly the response field names — Helcim has shifted between
// camelCase and snake_case across versions.

import { randomBytes } from 'node:crypto'

const BASE_URL = process.env.HELCIM_API_BASE_URL ?? 'https://api.helcim.com/v2'

export class HelcimApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, message: string, body: unknown) {
    super(message)
    this.name = 'HelcimApiError'
    this.status = status
    this.body = body
  }
}

interface RequestOpts {
  path: string
  method: 'GET' | 'POST' | 'DELETE'
  apiToken: string
  body?: unknown
  // Helcim requires an idempotency-key on mutating endpoints (24 alnum chars).
  idempotencyKey?: string
}

async function helcimFetch<T>(opts: RequestOpts): Promise<T> {
  const headers: Record<string, string> = {
    'api-token': opts.apiToken,
    Accept: 'application/json',
  }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey

  const res = await fetch(`${BASE_URL}${opts.path}`, {
    method: opts.method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })

  const text = await res.text()
  const body: unknown = text ? safeJson(text) : null
  if (!res.ok) {
    throw new HelcimApiError(
      res.status,
      `Helcim ${opts.method} ${opts.path} failed: ${res.status}`,
      body,
    )
  }
  return body as T
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

// 24-char alphanumeric idempotency key (Helcim's documented requirement).
export function idempotencyKey(): string {
  return randomBytes(18).toString('base64url').slice(0, 24)
}

// ---------------------------------------------------------------------------
// /helcim-pay/initialize — returns a checkoutToken used by HelcimPay.js to
// mount the payment iframe on the client portal.
// ---------------------------------------------------------------------------

export interface InitializeRequest {
  paymentType: 'purchase' | 'preauth' | 'verify'
  amount: number // dollars (decimal), NOT cents
  currency: 'USD' | 'CAD'
  invoiceNumber?: string
  customerCode?: string
  // Pre-fill the customer's email so HelcimPay can email the receipt.
  customerEmail?: string
}

export interface InitializeResponse {
  checkoutToken: string
  secretToken: string
}

export async function initializeHelcimPay(
  apiToken: string,
  body: InitializeRequest,
): Promise<InitializeResponse> {
  return helcimFetch<InitializeResponse>({
    path: '/helcim-pay/initialize',
    method: 'POST',
    apiToken,
    idempotencyKey: idempotencyKey(),
    body,
  })
}

// ---------------------------------------------------------------------------
// /payment/refund — refund a previously-captured transaction in part or
// in full.
// ---------------------------------------------------------------------------

export interface RefundRequest {
  originalTransactionId: number | string
  amount: number // dollars
  ipAddress?: string
}

export interface RefundResponse {
  transactionId: number
  status: string
}

export async function refundHelcimTransaction(
  apiToken: string,
  body: RefundRequest,
): Promise<RefundResponse> {
  return helcimFetch<RefundResponse>({
    path: '/payment/refund',
    method: 'POST',
    apiToken,
    idempotencyKey: idempotencyKey(),
    body,
  })
}

// ---------------------------------------------------------------------------
// /card-transactions/{id} — used by the webhook handler to verify a
// transaction we received notification about actually belongs to this
// merchant and to read its full details.
// ---------------------------------------------------------------------------

export interface TransactionDetail {
  transactionId: number
  status: string
  amount: number
  currency: string
  invoiceNumber?: string
  type: string
}

export async function getHelcimTransaction(
  apiToken: string,
  transactionId: string | number,
): Promise<TransactionDetail> {
  return helcimFetch<TransactionDetail>({
    path: `/card-transactions/${transactionId}`,
    method: 'GET',
    apiToken,
  })
}
