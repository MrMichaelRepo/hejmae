// AES-256-GCM helpers for QBO refresh + access tokens.
//
// Same scheme as lib/payments/secrets.ts but inlined here so the QBO
// column model (tokens stored inline on qbo_connections, not a separate
// secrets table) stays straightforward. Master key reuses PAYMENT_SECRET_KEY
// — one rotation surface, not two.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from '@/lib/env'

const ALGO = 'aes-256-gcm' as const
const IV_LEN = 12

export class QboSecretsConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QboSecretsConfigError'
  }
}

function masterKey(): Buffer {
  const raw = env.paymentSecretKey()
  if (!raw) {
    throw new QboSecretsConfigError(
      'PAYMENT_SECRET_KEY is not set. Generate one with `openssl rand -base64 32` ' +
        'and add it to .env.local before connecting QuickBooks.',
    )
  }
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new QboSecretsConfigError(
      `PAYMENT_SECRET_KEY must decode to 32 bytes (got ${key.length}). ` +
        'Use `openssl rand -base64 32` to regenerate.',
    )
  }
  return key
}

export interface EncryptedBlob {
  ciphertext: Buffer
  iv: Buffer
  authTag: Buffer
}

export function encryptToken(plaintext: string): EncryptedBlob {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, masterKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return { ciphertext, iv, authTag }
}

export function decryptToken(blob: EncryptedBlob): string {
  const decipher = createDecipheriv(ALGO, masterKey(), blob.iv)
  decipher.setAuthTag(blob.authTag)
  const plain = Buffer.concat([
    decipher.update(blob.ciphertext),
    decipher.final(),
  ])
  return plain.toString('utf8')
}

// Supabase represents bytea as hex ("\x...") or base64 depending on path;
// accept both.
export function bytesFromDb(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (typeof value === 'string') {
    if (value.startsWith('\\x')) return Buffer.from(value.slice(2), 'hex')
    return Buffer.from(value, 'base64')
  }
  throw new Error(`Cannot decode bytea value of type ${typeof value}`)
}

export function bytesForDb(buf: Buffer): string {
  return '\\x' + buf.toString('hex')
}
