/** Tiny localStorage helpers: the offline cache for recipes, pantry and the shopping list + sync queue. */

export function readStore<T extends object>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<T>) } : fallback
  } catch {
    return fallback
  }
}

export function readList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

export function writeStore(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota exceeded – ignore */
  }
}

export const STORE_KEYS = {
  recipes: 'ro.recipes',
  pantry: 'ro.pantry',
  shopping: 'ro.shopping',
} as const


