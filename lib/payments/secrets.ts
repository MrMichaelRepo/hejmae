// Encrypted secret storage for payment-processor credentials.
//
// AES-256-GCM, keyed by PAYMENT_SECRET_KEY (32 bytes, base64). The DB only
// ever sees (ciphertext, iv, auth_tag); plaintext lives in memory just long
// enough to make a Helcim API call. Server-only — the secrets table has no
// RLS policies, so all reads/writes go through supabaseAdmin().
//
// Master-key rotation: re-encrypt all rows with the new key, then update
// the env var. Out of scope for v1; document when needed.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from '@/lib/env'
import { supabaseAdmin } from '@/lib/supabase/server'

const ALGO = 'aes-256-gcm' as const
const IV_LEN = 12 // 96-bit IV is the GCM default and is what NIST recommends.

export class PaymentSecretsConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PaymentSecretsConfigError'
  }
}

function masterKey(): Buffer {
  const raw = env.paymentSecretKey()
  if (!raw) {
    throw new PaymentSecretsConfigError(
      'PAYMENT_SECRET_KEY is not set. Generate one with `openssl rand -base64 32` ' +
        'and add it to .env.local before connecting Helcim.',
    )
  }
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new PaymentSecretsConfigError(
      `PAYMENT_SECRET_KEY must decode to 32 bytes (got ${key.length}). ` +
        'Use `openssl rand -base64 32` to regenerate.',
    )
  }
  return key
}

interface EncryptedBlob {
  ciphertext: Buffer
  iv: Buffer
  authTag: Buffer
}

function encrypt(plaintext: string): EncryptedBlob {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, masterKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return { ciphertext, iv, authTag }
}

function decrypt(blob: EncryptedBlob): string {
  const decipher = createDecipheriv(ALGO, masterKey(), blob.iv)
  decipher.setAuthTag(blob.authTag)
  const plain = Buffer.concat([
    decipher.update(blob.ciphertext),
    decipher.final(),
  ])
  return plain.toString('utf8')
}

// Supabase represents bytea as either a hex string ("\x...") or a base64
// string depending on the encoding hint. PostgREST returns the hex form by
// default for inserts read-back, but other paths can return base64. Accept
// both so the caller doesn't have to know.
function bytesFromDb(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (typeof value === 'string') {
    if (value.startsWith('\\x')) return Buffer.from(value.slice(2), 'hex')
    // Fall back to base64 — PostgREST sometimes returns this form.
    return Buffer.from(value, 'base64')
  }
  throw new Error(`Cannot decode bytea value of type ${typeof value}`)
}

function bytesForDb(buf: Buffer): string {
  // PostgREST accepts the standard `\x<hex>` literal for bytea.
  return '\\x' + buf.toString('hex')
}

// ---------------------------------------------------------------------------
// Public API — keyed by (accountId, name) so a single processor account can
// hold multiple secrets (e.g. api_token + webhook_verifier).
// ---------------------------------------------------------------------------

export async function setProcessorSecret(
  accountId: string,
  name: string,
  plaintext: string,
): Promise<void> {
  const blob = encrypt(plaintext)
  const sb = supabaseAdmin()
  const { error } = await sb.from('payment_processor_secrets').upsert(
    {
      account_id: accountId,
      name,
      ciphertext: bytesForDb(blob.ciphertext),
      iv: bytesForDb(blob.iv),
      auth_tag: bytesForDb(blob.authTag),
    },
    { onConflict: 'account_id,name' },
  )
  if (error) throw error
}

export async function getProcessorSecret(
  accountId: string,
  name: string,
): Promise<string | null> {
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from('payment_processor_secrets')
    .select('ciphertext, iv, auth_tag')
    .eq('account_id', accountId)
    .eq('name', name)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return decrypt({
    ciphertext: bytesFromDb(data.ciphertext),
    iv: bytesFromDb(data.iv),
    authTag: bytesFromDb(data.auth_tag),
  })
}

export async function deleteProcessorSecrets(accountId: string): Promise<void> {
  const sb = supabaseAdmin()
  const { error } = await sb
    .from('payment_processor_secrets')
    .delete()
    .eq('account_id', accountId)
  if (error) throw error
}
