// Pure helpers for storage path normalization — no server-only imports.
// Split out of lib/storage.ts so validators (lib/validations/common.ts) can
// import without pulling in supabaseAdmin (which is server-only).

const STORAGE_BUCKET = 'hejmae'

// Returns the bare storage path if `stored` is a Supabase public or signed
// URL into our bucket, otherwise null (external URL).
export function extractBucketPath(stored: string): string | null {
  if (!stored) return null
  if (/^https?:\/\//i.test(stored)) {
    const m = stored.match(
      /\/storage\/v1\/object\/(?:public|sign)\/hejmae\/([^?]+)/,
    )
    return m ? decodeURIComponent(m[1]!) : null
  }
  return stored
}

// Normalize an inbound URL value (from a client request body) to what
// should be stored in the DB:
//   * null/empty       → null
//   * Supabase URL into our bucket (public OR signed) → extract path
//   * external https URL → unchanged (paste-a-URL flow)
//   * bare path → unchanged
export function normalizeStoredAsset(
  value: string | null | undefined,
): string | null {
  if (!value) return null
  const path = extractBucketPath(value)
  if (path !== null && /^https?:\/\//i.test(value)) return path
  return value
}
