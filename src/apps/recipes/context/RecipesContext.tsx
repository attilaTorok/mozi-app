import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { db, isNetworkError, toastMessage } from '../lib/dbClient'
import { useGlobalError } from '../../../shared/ErrorContext'
import { t } from '../strings'
import { readList, STORE_KEYS, writeStore } from '../lib/offlineStore'
import { localDateString, parseDate } from '../lib/recipes'
import type { Recipe, RecipeInput, RecipePatch } from '../types'

interface RecipesValue {
  recipes: Recipe[]
  loading: boolean
  /** true when the last refresh failed because of missing connectivity (cached data shown) */
  stale: boolean
  refresh: () => Promise<void>
  getById: (id: string) => Recipe | undefined
  create: (input: RecipeInput) => Promise<Recipe>
  update: (id: string, patch: RecipePatch) => Promise<Recipe>
  remove: (id: string) => Promise<void>
  logCooked: (recipe: Recipe, cookedDate?: string) => Promise<Recipe>
}

const RecipesContext = createContext<RecipesValue | null>(null)

/** Defensive normalization of JSONB columns. */
function normalizeRecipe(r: Recipe): Recipe {
  return { ...r, tags: r.tags ?? [], ingredients: r.ingredients ?? [] }
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
  const [recipes, setRecipes] = useState<Recipe[]>(() => readList<Recipe>(STORE_KEYS.recipes))
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
      const { data } = await db.from('recipes').insert(input).select().single().throwOnError().then(undefined, fail)
      const rec = normalizeRecipe(data as Recipe)
      store((prev) => [rec, ...prev])
      return rec
    },
    [store, fail],
  )

  const update = useCallback(
    async (id: string, patch: RecipePatch) => {
      const { data } = await db.from('recipes').update(patch).eq('id', id).select().single().throwOnError().then(undefined, fail)
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
    async (recipe: Recipe, cookedDate?: string) => {
      const date = cookedDate && /^\d{4}-\d{2}-\d{2}$/.test(cookedDate) ? cookedDate : localDateString()
      const [y, m, d] = date.split('-').map(Number)
      const cookedAt = new Date(y, m - 1, d, 12, 0, 0).toISOString()

      await db
        .from('cooking_logs')
        .insert({ recipe_id: recipe.id, cooked_at: cookedAt, cooked_date: date })
        .throwOnError()
        .then(undefined, fail)

      const prevMs = parseDate(recipe.last_cooked_at)
      const prevYmd = prevMs === null ? null : localDateString(new Date(prevMs))
      const patch: RecipePatch = { times_cooked: recipe.times_cooked + 1 }
      if (prevYmd === null || date >= prevYmd) patch.last_cooked_at = cookedAt
      return update(recipe.id, patch)
    },
    [update, fail],
  )

  const value = useMemo(
    () => ({ recipes, loading, stale, refresh, getById, create, update, remove, logCooked }),
    [recipes, loading, stale, refresh, getById, create, update, remove, logCooked],
  )
  return <RecipesContext.Provider value={value}>{children}</RecipesContext.Provider>
}

export function useRecipes(): RecipesValue {
  const ctx = useContext(RecipesContext)
  if (!ctx) throw new Error('useRecipes must be used inside RecipesProvider')
  return ctx
}

