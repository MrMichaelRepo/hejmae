// Magic-link token generation. 256-bit URL-safe random.
import { randomBytes } from 'crypto'

export function generateMagicToken(): string {
  return randomBytes(32).toString('base64url')
}

// Default TTL for newly issued portal links. A leaked email forwarded to a
// later-compromised mailbox stops working after this window; the designer
// can re-send to rotate.
export const MAGIC_LINK_TTL_DAYS = 90

export function magicLinkExpiresAt(now: Date = new Date()): string {
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() + MAGIC_LINK_TTL_DAYS)
  return d.toISOString()
}
