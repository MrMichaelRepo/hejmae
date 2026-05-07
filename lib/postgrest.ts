// Helpers for safely passing user input into PostgREST filter expressions.
//
// Supabase's typed methods (`.eq`, `.ilike`, …) parameterize their values,
// but `.or(<string>)` and `.filter(<string>)` take a raw filter expression
// where commas, parens, colons, and `.` separate clauses. Interpolating
// untrusted input into those strings can let an attacker break out of the
// intended clause and add their own (e.g. `name.is.null` to match every
// row). We don't currently expose any tables where extra clauses would
// leak data — the catalog search is scoped by `.in('id', ids)` to the
// caller's library — but the right move is to sanitize at the boundary
// regardless.

// Strip PostgREST clause separators and clamp length. Spaces, hyphens,
// apostrophes, and accented chars survive so legitimate product searches
// ("Visual Comfort", "O'Henry", "café") still work.
export function sanitizePostgrestSearch(input: string, maxLength = 80): string {
  return input
    .replace(/[,()*:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}
