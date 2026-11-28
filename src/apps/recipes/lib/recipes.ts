import type { CostTier, PantryItem, Recipe } from '../types'

const DAY_MS = 86_400_000

/** Local calendar date as YYYY-MM-DD. */
export function localDateString(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Lowercase + strip accents so "tojas" matches "tojás". */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

export function parseDate(s: string | null | undefined): number | null {
  if (!s) return null
  const ms = Date.parse(s.replace(' ', 'T'))
  return Number.isNaN(ms) ? null : ms
}

export function daysSince(s: string | null | undefined, now = Date.now()): number | null {
  const ms = parseDate(s)
  return ms === null ? null : Math.max(0, Math.floor((now - ms) / DAY_MS))
}

export type SortKey = 'name' | 'dormant' | 'mostCooked' | 'rating' | 'fastest'

export interface RecipeFilter {
  query: string
  tag: string
  creator: string
  cost: CostTier | ''
}

/**
 * Search matches title, ingredients and tags. Comma-separated terms must ALL match
 * (pantry filter: "tojás, paradicsom" finds recipes containing both).
 */
export function filterRecipes(recipes: Recipe[], f: RecipeFilter): Recipe[] {
  const terms = f.query.split(',').map(normalize).filter(Boolean)

  return recipes.filter((r) => {
    if (f.tag && !r.tags.some((tag) => normalize(tag) === normalize(f.tag))) return false
    if (f.creator && (r.added_by ?? '') !== f.creator) return false
    if (f.cost && r.cost_tier !== f.cost) return false
    if (terms.length === 0) return true

    const haystack = [normalize(r.title), ...r.ingredients.map((i) => normalize(i.name)), ...r.tags.map(normalize)]
    return terms.every((term) => haystack.some((h) => h.includes(term)))
  })
}

export function sortRecipes(recipes: Recipe[], key: SortKey): Recipe[] {
  const list = [...recipes]
  const byName = (a: Recipe, b: Recipe) => a.title.localeCompare(b.title, 'hu')
  switch (key) {
    case 'name':
      return list.sort(byName)
    case 'dormant':
      // Never cooked first, then cooked longest ago.
      return list.sort((a, b) => {
        const da = parseDate(a.last_cooked_at)
        const db = parseDate(b.last_cooked_at)
        if (da === null && db === null) return byName(a, b)
        if (da === null) return -1
        if (db === null) return 1
        return da - db
      })
    case 'mostCooked':
      return list.sort((a, b) => b.times_cooked - a.times_cooked || byName(a, b))
    case 'rating':
      return list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || byName(a, b))
    case 'fastest':
      return list.sort((a, b) => a.prep_time_minutes - b.prep_time_minutes || byName(a, b))
  }
}

/** The recipe with the oldest last_cooked_at, if that is more than `minDays` ago. */
export function findDormant(recipes: Recipe[], minDays = 21): { recipe: Recipe; days: number } | null {
  let best: { recipe: Recipe; days: number } | null = null
  for (const recipe of recipes) {
    const days = daysSince(recipe.last_cooked_at)
    if (days === null || days <= minDays) continue
    if (!best || days > best.days) best = { recipe, days }
  }
  return best
}

export function pickRandom<T>(items: T[], count: number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, count)
}

/** Distinct, non-empty `added_by` values (for chips + datalist autocomplete). */
export const DEFAULT_CREATORS = ['Attila', 'Szabina'] as const

/** Default creators first, then any other `added_by` values found in the recipes. */
export function uniqueCreators(recipes: Recipe[]): string[] {
  const defaults: readonly string[] = DEFAULT_CREATORS
  const extra = new Set<string>()
  for (const r of recipes) {
    const name = r.added_by?.trim()
    if (name && !defaults.includes(name)) extra.add(name)
  }
  return [...defaults, ...[...extra].sort((a, b) => a.localeCompare(b, 'hu'))]
}

export function uniqueTags(recipes: Recipe[]): string[] {
  const set = new Set<string>()
  for (const r of recipes) for (const tag of r.tags) set.add(tag)
  return [...set].sort((a, b) => a.localeCompare(b, 'hu'))
}

/** Does a pantry product cover a recipe ingredient? ("Csirkemell" ~ "Csirkemellfilé") */
export function namesMatch(a: string, b: string): boolean {
  const x = normalize(a)
  const y = normalize(b)
  if (!x || !y) return false
  return x === y || (x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y))
}

export function findInPantry(ingredientName: string, pantry: PantryItem[]): PantryItem | undefined {
  return pantry.find((p) => p.amount > 0 && namesMatch(ingredientName, p.item_name))
}

/** "Raktár-mentő": recipes that use the products with the nearest expiry date. */
export function pantryRescue(
  recipes: Recipe[],
  pantry: PantryItem[],
  count = 3,
): { recipe: Recipe; uses: string[] }[] {
  const expiring = pantry
    .filter((p) => p.amount > 0 && p.expires_at)
    .sort((a, b) => (a.expires_at as string).localeCompare(b.expires_at as string))
    .slice(0, 5)
  if (expiring.length === 0) return []

  return recipes
    .map((recipe) => {
      let score = 0
      const uses: string[] = []
      expiring.forEach((item, rank) => {
        if (recipe.ingredients.some((i) => namesMatch(i.name, item.item_name))) {
          score += expiring.length - rank // sooner expiry weighs more
          uses.push(item.item_name)
        }
      })
      return { recipe, uses, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
}

