// ISO-week helpers for the Clippings feature.
//
// ISO 8601 weeks start on Monday. We render dates as plain YYYY-MM-DD
// strings (no tz) so they line up with the `week_added` DATE column and
// don't surprise the filter UI when the user's tz shifts the underlying
// timestamp around midnight.

export function isoWeekMonday(d: Date = new Date()): string {
  // Work in UTC so the same wall clock yields the same week boundary
  // regardless of server tz. (Designers are scattered across tzs; the
  // grouping is a coarse "this week / last week" affordance, not a
  // hairs-precise calendar.)
  const utc = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  )
  const dow = utc.getUTCDay() // 0 = Sunday … 6 = Saturday
  const daysSinceMonday = (dow + 6) % 7
  utc.setUTCDate(utc.getUTCDate() - daysSinceMonday)
  return utc.toISOString().slice(0, 10)
}

export function formatWeekRange(mondayIso: string, now: Date = new Date()): string {
  const thisMonday = isoWeekMonday(now)
  if (mondayIso === thisMonday) return 'This week'

  const lastWeek = new Date(`${thisMonday}T00:00:00Z`)
  lastWeek.setUTCDate(lastWeek.getUTCDate() - 7)
  if (mondayIso === lastWeek.toISOString().slice(0, 10)) return 'Last week'

  // Otherwise show "May 5–11" style range.
  const start = new Date(`${mondayIso}T00:00:00Z`)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)

  const startMonth = start.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const endMonth = end.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const startDay = start.getUTCDate()
  const endDay = end.getUTCDate()

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}–${endDay}`
  }
  return `${startMonth} ${startDay}–${endMonth} ${endDay}`
}
