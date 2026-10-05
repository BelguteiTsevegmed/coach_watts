/**
 * Arithmetic on `yyyy-MM-dd` calendar-date keys. Keys are treated as UTC
 * midnight so the result never depends on the runtime timezone; convert to
 * the athlete's local key first (e.g. with `getUserLocalDate`).
 */

const DAY_MS = 24 * 60 * 60 * 1000

function keyToUtcMs(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y || 1970, (m || 1) - 1, d || 1)
}

export function addDaysToKey(key: string, days: number): string {
  return new Date(keyToUtcMs(key) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Whole calendar days from `fromKey` to `toKey` (negative when `toKey` is earlier). */
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  return Math.round((keyToUtcMs(toKey) - keyToUtcMs(fromKey)) / DAY_MS)
}
