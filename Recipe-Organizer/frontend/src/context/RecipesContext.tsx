import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { db, isNetworkError } from '../lib/dbClient'
import { readList, STORE_KEYS, writeStore } from '../lib/offlineStore'
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
  logCooked: (recipe: Recipe) => Promise<Recipe>
}

const RecipesContext = createContext<RecipesValue | null>(null)

/** Defensive normalization of JSONB columns. */
function normalizeRecipe(r: Recipe): Recipe {
  return { ...r, tags: r.tags ?? [], ingredients: r.ingredients ?? [] }
}

export function RecipesProvider({ children }: { children: ReactNode }) {
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
      else console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

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
      const { data } = await db.from('recipes').insert(input).select().single().throwOnError()
      const rec = normalizeRecipe(data as Recipe)
      store((prev) => [rec, ...prev])
      return rec
    },
    [store],
  )

  const update = useCallback(
    async (id: string, patch: RecipePatch) => {
      const { data } = await db.from('recipes').update(patch).eq('id', id).select().single().throwOnError()
      const rec = normalizeRecipe(data as Recipe)
      store((prev) => prev.map((r) => (r.id === id ? rec : r)))
      return rec
    },
    [store],
  )

  const remove = useCallback(
    async (id: string) => {
      await db.from('recipes').delete().eq('id', id).throwOnError()
      store((prev) => prev.filter((r) => r.id !== id))
    },
    [store],
  )

  const logCooked = useCallback(
    (recipe: Recipe) => update(recipe.id, { times_cooked: recipe.times_cooked + 1, last_cooked_at: new Date().toISOString() }),
    [update],
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

