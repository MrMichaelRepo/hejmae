// Magic-link token generation. 256-bit URL-safe random.
import { randomBytes } from 'crypto'

export function generateMagicToken(): string {
  return randomBytes(32).toString('base64url')
}
