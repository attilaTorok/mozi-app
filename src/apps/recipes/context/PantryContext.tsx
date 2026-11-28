import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { db, isNetworkError, toastMessage } from '../lib/dbClient'
import { useGlobalError } from '../../../shared/ErrorContext'
import { t } from '../strings'
import { readList, STORE_KEYS, writeStore } from '../lib/offlineStore'
import { normalize } from '../lib/recipes'
import type { NewPantryItem, PantryItem } from '../types'

type PantryPatch = Partial<Pick<PantryItem, 'quantity' | 'expiry_date' | 'category' | 'notes' | 'min_threshold'>>

interface PantryValue {
  items: PantryItem[]
  loading: boolean
  stale: boolean
  refresh: () => Promise<void>
  /** Adds the item; if a product with the same name and unit exists it is merged. Returns true when merged. */
  add: (item: NewPantryItem) => Promise<boolean>
  /** ± stepper: changes the quantity (never below 0). */
  adjust: (id: string, delta: number) => Promise<void>
  update: (id: string, changes: PantryPatch) => Promise<void>
  remove: (id: string) => Promise<void>
}

const PantryContext = createContext<PantryValue | null>(null)

function slim(r: PantryItem): PantryItem {
  return {
    ...r,
    item_name: r.item_name ?? '',
    quantity: Number(r.quantity) || 0,
    unit: r.unit ?? '',
    category: r.category ?? null,
    expiry_date: r.expiry_date ?? null,
    min_threshold: r.min_threshold == null ? null : Number(r.min_threshold),
    added_by: r.added_by ?? null,
    notes: r.notes ?? null,
    created_at: r.created_at ?? '',
  }
}

function sortItems(list: PantryItem[]): PantryItem[] {
  return [...list].sort((a, b) => {
    if (a.expiry_date !== b.expiry_date) {
      if (!a.expiry_date) return 1
      if (!b.expiry_date) return -1
      return a.expiry_date.localeCompare(b.expiry_date)
    }
    return a.item_name.localeCompare(b.item_name, 'hu')
  })
}

export function PantryProvider({ children }: { children: ReactNode }) {
  const { showError } = useGlobalError()
  const fail = useCallback(
    (e: unknown, fallback: string = t.errors.save): never => {
      showError(e, toastMessage(e, fallback))
      throw e
    },
    [showError],
  )
  const [items, setItems] = useState<PantryItem[]>(() => sortItems(readList<PantryItem>(STORE_KEYS.pantry).map(slim)))
  const [loading, setLoading] = useState(true)
  const [stale, setStale] = useState(false)

  const store = useCallback((updater: (prev: PantryItem[]) => PantryItem[]) => {
    setItems((prev) => {
      const next = sortItems(updater(prev))
      writeStore(STORE_KEYS.pantry, next)
      return next
    })
  }, [])

  const refresh = useCallback(async () => {
    try {
      const { data } = await db.from('pantry_items').select('*').throwOnError()
      const list = sortItems(((data ?? []) as PantryItem[]).map(slim))
      setItems(list)
      writeStore(STORE_KEYS.pantry, list)
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

  const patch = useCallback(
    async (id: string, changes: PantryPatch) => {
      const { data } = await db
        .from('pantry_items')
        .update(changes)
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
        .then(undefined, fail)
      const row = slim(data as PantryItem)
      store((prev) => prev.map((i) => (i.id === id ? row : i)))
    },
    [store, fail],
  )

  const add = useCallback(
    async (item: NewPantryItem) => {
      const existing = items.find(
        (i) => normalize(i.item_name) === normalize(item.item_name) && i.unit.trim().toLowerCase() === item.unit.trim().toLowerCase(),
      )
      if (existing) {
        const dates = [existing.expiry_date, item.expiry_date].filter((d): d is string => Boolean(d)).sort()
        await patch(existing.id, { quantity: existing.quantity + item.quantity, expiry_date: dates[0] ?? null })
        return true
      }
      const { data } = await db
        .from('pantry_items')
        .insert({
          item_name: item.item_name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          expiry_date: item.expiry_date,
          min_threshold: item.min_threshold,
          added_by: item.added_by,
          notes: item.notes,
        })
        .select()
        .single()
        .throwOnError()
        .then(undefined, fail)
      store((prev) => [...prev, slim(data as PantryItem)])
      return false
    },
    [items, patch, store, fail],
  )

  const adjust = useCallback(
    async (id: string, delta: number) => {
      const cur = items.find((i) => i.id === id)
      if (!cur) return
      await patch(id, { quantity: Math.max(0, cur.quantity + delta) })
    },
    [items, patch],
  )

  const remove = useCallback(
    async (id: string) => {
      await db.from('pantry_items').delete().eq('id', id).throwOnError().then(undefined, fail)
      store((prev) => prev.filter((i) => i.id !== id))
    },
    [store, fail],
  )

  const value = useMemo(
    () => ({ items, loading, stale, refresh, add, adjust, update: patch, remove }),
    [items, loading, stale, refresh, add, adjust, patch, remove],
  )
  return <PantryContext.Provider value={value}>{children}</PantryContext.Provider>
}

export function usePantry(): PantryValue {
  const ctx = useContext(PantryContext)
  if (!ctx) throw new Error('usePantry must be used inside PantryProvider')
  return ctx
}
