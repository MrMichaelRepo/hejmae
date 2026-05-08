// Rate limiting via Upstash Redis. Soft-fails (allows the request) when
// Upstash env vars are not configured — useful for local dev and as a
// safety net if Upstash is briefly unreachable, since denying every
// request on an unrelated outage is worse than a brief lift of limits.
//
// Buckets:
//   * portal — magic-link reads. Tightly limited per IP because the token
//     is the only authorization and these endpoints are unauthenticated.
//   * portalPay — payment-intent creation. Stricter again to prevent
//     abuse via Stripe API hits.
//   * upload — file upload endpoints. Limited by designer to bound the
//     storage cost a runaway script could inflict.
//   * write — generic state-changing endpoints. Defends against logged-in
//     users (or stolen sessions) hammering the DB.
//
// Each bucket uses sliding-window because token-bucket allows bursty
// behavior that doesn't actually happen in our UX.
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { env } from '@/lib/env'

let _redis: Redis | null | undefined

function redis(): Redis | null {
  if (_redis !== undefined) return _redis
  const url = env.upstashRedisUrl()
  const token = env.upstashRedisToken()
  if (!url || !token) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[ratelimit] UPSTASH_REDIS_REST_URL/TOKEN not set in production — rate limiting disabled',
      )
    }
    _redis = null
    return null
  }
  _redis = new Redis({ url, token })
  return _redis
}

const limiters = {
  portal: () => buildLimiter('portal', 30, '1 m'),
  // Per-token bucket: caps total hits against a single magic link regardless
  // of source IP, blunting credential-spraying attempts that rotate IPs.
  portalToken: () => buildLimiter('portal_token', 60, '1 m'),
  portalPay: () => buildLimiter('portal_pay', 5, '1 m'),
  upload: () => buildLimiter('upload', 60, '1 h'),
  write: () => buildLimiter('write', 120, '1 m'),
}

const cache = new Map<string, Ratelimit>()
function buildLimiter(
  prefix: string,
  limit: number,
  window: '1 m' | '1 h' | '5 m',
): Ratelimit | null {
  const r = redis()
  if (!r) return null
  const key = `${prefix}:${limit}:${window}`
  const existing = cache.get(key)
  if (existing) return existing
  const made = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(limit, window),
    prefix: `rl:${prefix}`,
    analytics: false,
  })
  cache.set(key, made)
  return made
}

export type Bucket = keyof typeof limiters

export interface RateLimitResult {
  ok: boolean
  remaining: number
  reset: number
}

export async function checkRateLimit(
  bucket: Bucket,
  identifier: string,
): Promise<RateLimitResult> {
  const lim = limiters[bucket]()
  if (!lim) return { ok: true, remaining: -1, reset: 0 }
  try {
    const r = await lim.limit(identifier)
    return { ok: r.success, remaining: r.remaining, reset: r.reset }
  } catch (e) {
    // Soft-fail on Upstash outage. Log so we notice trends.
    console.error('[ratelimit] upstash error — allowing request', e)
    return { ok: true, remaining: -1, reset: 0 }
  }
}

// Pull the caller's IP from reverse-proxy headers, in preference order.
//
// `x-vercel-forwarded-for` is set by Vercel's edge from the actual TCP peer
// and stripped from inbound requests, so it can't be spoofed by the client.
// `x-forwarded-for` is *also* set by clients on direct hits, so attacker
// supplied values can defeat per-IP limiting unless we explicitly prefer
// the platform header. We fall back to it (and to `x-real-ip`) only when
// the trusted header isn't present — e.g. local dev behind a different
// proxy. Last-resort 'unknown' keeps rate limiting active (per-bucket
// aggregated) rather than failing open.
export function callerIp(req: Request): string {
  const vercel = req.headers.get('x-vercel-forwarded-for')
  if (vercel) return vercel.split(',')[0]!.trim()
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real
  return 'unknown'
}
