import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { db, isNetworkError, toastMessage } from '../lib/dbClient'
import { useGlobalError } from '../../../shared/ErrorContext'
import { t } from '../strings'
import { readList, STORE_KEYS, writeStore } from '../lib/offlineStore'
import { localDateString } from '../lib/recipes'
import type { CostTier, Ingredient, Recipe, RecipeInput, RecipePatch } from '../types'

const RECIPE_WRITE_KEYS = [
  'title',
  'description',
  'image_url',
  'source_url',
  'source',
  'prep_time_minutes',
  'cook_time_minutes',
  'base_servings',
  'category',
  'cuisine',
  'difficulty',
  'cost_tier',
  'tags',
  'ingredients',
  'steps',
  'notes',
  'is_favorite',
  'added_by',
  'last_cooked_at',
  'times_cooked',
] as const

const COST: CostTier[] = ['CHEAP', 'MODERATE', 'EXPENSIVE']

interface RecipesValue {
  recipes: Recipe[]
  ratings: Record<string, number>
  loading: boolean
  /** true when the last refresh failed because of missing connectivity (cached data shown) */
  stale: boolean
  refresh: () => Promise<void>
  getById: (id: string) => Recipe | undefined
  create: (input: RecipeInput) => Promise<Recipe>
  update: (id: string, patch: RecipePatch) => Promise<Recipe>
  remove: (id: string) => Promise<void>
  logCooked: (recipe: Recipe, cookedDate?: string, servings?: number) => Promise<Recipe>
  setRating: (recipeId: string, rating: number, raterName?: string | null) => Promise<void>
}

const RecipesContext = createContext<RecipesValue | null>(null)

function asSteps(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean)
  if (typeof v === 'string') return v.split('\n').map((l) => l.trim()).filter(Boolean)
  return []
}

function asIngredients(v: unknown): Ingredient[] {
  if (!Array.isArray(v)) return []
  return v.map((row) => {
    const r = row as Partial<Ingredient>
    return { name: String(r.name ?? ''), amount: r.amount ?? null, unit: String(r.unit ?? '') }
  })
}

function pickWrite(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of RECIPE_WRITE_KEYS) {
    if (key in input) out[key] = input[key]
  }
  return out
}

/** Defensive normalization of JSONB / nullable columns. */
function normalizeRecipe(r: Recipe): Recipe {
  const cost = COST.includes(r.cost_tier) ? r.cost_tier : 'MODERATE'
  return {
    ...r,
    updated_at: r.updated_at ?? null,
    description: r.description ?? null,
    image_url: r.image_url ?? null,
    source_url: r.source_url ?? null,
    source: r.source ?? null,
    prep_time_minutes: Number(r.prep_time_minutes) || 0,
    cook_time_minutes: r.cook_time_minutes == null ? null : Number(r.cook_time_minutes) || 0,
    base_servings: Number(r.base_servings) || 4,
    category: r.category ?? null,
    cuisine: r.cuisine ?? null,
    difficulty: r.difficulty ?? null,
    cost_tier: cost,
    tags: r.tags ?? [],
    ingredients: asIngredients(r.ingredients),
    steps: asSteps(r.steps),
    notes: r.notes ?? null,
    is_favorite: Boolean(r.is_favorite),
    added_by: r.added_by ?? null,
    last_cooked_at: r.last_cooked_at ?? null,
    times_cooked: Number(r.times_cooked) || 0,
  }
}

function averageRatings(rows: { recipe_id: string; rating: number }[]): Record<string, number> {
  const sum: Record<string, { total: number; n: number }> = {}
  for (const row of rows) {
    const cur = sum[row.recipe_id] ?? { total: 0, n: 0 }
    cur.total += Number(row.rating) || 0
    cur.n += 1
    sum[row.recipe_id] = cur
  }
  const avg: Record<string, number> = {}
  for (const [id, v] of Object.entries(sum)) avg[id] = Math.round((v.total / v.n) * 10) / 10
  return avg
}

export function RecipesProvider({ children }: { children: ReactNode }) {
  const { showError } = useGlobalError()
  const fail = useCallback(
    (e: unknown, fallback: string = t.errors.save): never => {
      showError(e, toastMessage(e, fallback))
      throw e
    },
    [showError],
  )
  const [recipes, setRecipes] = useState<Recipe[]>(() => readList<Recipe>(STORE_KEYS.recipes).map(normalizeRecipe))
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [stale, setStale] = useState(false)

  const store = useCallback((updater: (prev: Recipe[]) => Recipe[]) => {
    setRecipes((prev) => {
      const next = updater(prev)
      writeStore(STORE_KEYS.recipes, next)
      return next
    })
  }, [])

  const refresh = useCallback(async () => {
    try {
      const { data } = await db.from('recipes').select('*').order('created_at', { ascending: false }).throwOnError()
      const list = ((data ?? []) as Recipe[]).map(normalizeRecipe)
      setRecipes(list)
      writeStore(STORE_KEYS.recipes, list)
      setStale(false)
      try {
        const { data: ratingRows } = await db.from('recipe_ratings').select('recipe_id, rating').throwOnError()
        setRatings(averageRatings((ratingRows ?? []) as { recipe_id: string; rating: number }[]))
      } catch (e) {
        if (!isNetworkError(e)) showError(e, toastMessage(e, t.errors.load))
      }
    } catch (e) {
      if (isNetworkError(e)) setStale(true)
      else showError(e, toastMessage(e, t.errors.load))
    } finally {
      setLoading(false)
    }
  }, [showError])

  useEffect(() => {
    void refresh()
    const onOnline = () => void refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const getById = useCallback((id: string) => recipes.find((r) => r.id === id), [recipes])

  const create = useCallback(
    async (input: RecipeInput) => {
      const { data } = await db
        .from('recipes')
        .insert(pickWrite(input as unknown as Record<string, unknown>))
        .select()
        .single()
        .throwOnError()
        .then(undefined, fail)
      const rec = normalizeRecipe(data as Recipe)
      store((prev) => [rec, ...prev])
      return rec
    },
    [store, fail],
  )

  const update = useCallback(
    async (id: string, patch: RecipePatch) => {
      const { data } = await db
        .from('recipes')
        .update({ ...pickWrite(patch as unknown as Record<string, unknown>), updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
        .then(undefined, fail)
      const rec = normalizeRecipe(data as Recipe)
      store((prev) => prev.map((r) => (r.id === id ? rec : r)))
      return rec
    },
    [store, fail],
  )

  const remove = useCallback(
    async (id: string) => {
      await db.from('recipes').delete().eq('id', id).throwOnError().then(undefined, fail)
      store((prev) => prev.filter((r) => r.id !== id))
    },
    [store, fail],
  )

  const logCooked = useCallback(
    async (recipe: Recipe, cookedDate?: string, servings?: number) => {
      const date = cookedDate && /^\d{4}-\d{2}-\d{2}$/.test(cookedDate) ? cookedDate : localDateString()
      const [y, m, d] = date.split('-').map(Number)
      const cookedAt = new Date(y, m - 1, d, 12, 0, 0).toISOString()
      const portion = servings && servings > 0 ? servings : recipe.base_servings || 4

      await db
        .from('cooking_logs')
        .insert({ recipe_id: recipe.id, cooked_at: cookedAt, cooked_date: date, servings: portion })
        .throwOnError()
        .then(undefined, fail)

      return update(recipe.id, {
        times_cooked: (recipe.times_cooked || 0) + 1,
        last_cooked_at: cookedAt,
      })
    },
    [update, fail],
  )

  const setRating = useCallback(
    async (recipeId: string, rating: number, raterName?: string | null) => {
      if (rating <= 0) return
      await db
        .from('recipe_ratings')
        .insert({ recipe_id: recipeId, rating, comment: null, rater_name: raterName ?? null })
        .throwOnError()
        .then(undefined, fail)
      const { data: ratingRows } = await db
        .from('recipe_ratings')
        .select('recipe_id, rating')
        .eq('recipe_id', recipeId)
        .throwOnError()
        .then(undefined, fail)
      const avg = averageRatings((ratingRows ?? []) as { recipe_id: string; rating: number }[])
      setRatings((prev) => ({ ...prev, ...avg }))
    },
    [fail],
  )

  const value = useMemo(
    () => ({ recipes, ratings, loading, stale, refresh, getById, create, update, remove, logCooked, setRating }),
    [recipes, ratings, loading, stale, refresh, getById, create, update, remove, logCooked, setRating],
  )
  return <RecipesContext.Provider value={value}>{children}</RecipesContext.Provider>
}

export function useRecipes(): RecipesValue {
  const ctx = useContext(RecipesContext)
  if (!ctx) throw new Error('useRecipes must be used inside RecipesProvider')
  return ctx
}
