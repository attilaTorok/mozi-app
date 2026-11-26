import { t } from '../strings'

export type ExpiryLevel = 'urgent' | 'warning' | 'fresh' | 'none'

const DAY_MS = 86_400_000

/** Local calendar date as YYYY-MM-DD. */
export function todayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Whole days from today until the given YYYY-MM-DD date (negative = already expired). */
export function daysUntil(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const [ty, tm, td] = todayIso().split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / DAY_MS)
}

/** "2026-11-30" → "2026. 11. 30." */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${y}. ${m}. ${d}.`
}

export function expiryInfo(iso: string | null): { level: ExpiryLevel; label: string } {
  if (!iso) return { level: 'none', label: t.pantry.noExpiry }
  const days = daysUntil(iso)
  if (days < 0) return { level: 'urgent', label: t.pantry.expired }
  if (days === 0) return { level: 'urgent', label: t.pantry.today }
  if (days <= 3) return { level: 'urgent', label: t.pantry.inDays(days) }
  if (days <= 7) return { level: 'warning', label: t.pantry.inDays(days) }
  return { level: 'fresh', label: t.pantry.date(formatDate(iso)) }
}

