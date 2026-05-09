// Week math for the time-tracking grid view. Weeks are Monday-start to
// match how most studios think about weekdays. All math in UTC because
// finance reports already are.

export function startOfWeekMonday(d: Date): Date {
  const day = d.getUTCDay() // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  out.setUTCDate(out.getUTCDate() + diff)
  return out
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime())
  out.setUTCDate(out.getUTCDate() + n)
  return out
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function fmtMinutes(mins: number): string {
  if (mins <= 0) return '0:00'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

export function weekDates(weekStart: Date): Date[] {
  return [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(weekStart, n))
}

export const WEEK_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
