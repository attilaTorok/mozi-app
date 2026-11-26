import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { db, isNetworkError, toastMessage } from '../lib/dbClient'
import { useGlobalError } from '../../../shared/ErrorContext'
import { t } from '../strings'
import { useOnline } from '../hooks/useOnline'
import { normalize } from '../lib/recipes'
import { readStore, STORE_KEYS, writeStore } from '../lib/offlineStore'
import type { NewShoppingItem, ShoppingItem } from '../types'

/**
 * Offline-first shopping list.
 *
 * - The list lives in localStorage and is rendered from there instantly.
 * - Every change is applied locally first (optimistic) and appended to a queue of
 *   pending operations, which is flushed to the database whenever we are online.
 * - After flushing, the server state is pulled and the still-pending operations
 *   are re-applied on top of it.
 */

type ItemPatch = Partial<Pick<ShoppingItem, 'is_checked' | 'amount' | 'unit' | 'item_name'>>

type PendingOp =
  | { type: 'add'; tempId: string; item: NewShoppingItem }
  | { type: 'update'; id: string; patch: ItemPatch }
  | { type: 'delete'; id: string }

interface Persisted {
  items: ShoppingItem[]
  queue: PendingOp[]
  syncedAt: number | null
}

interface ShoppingValue {
  items: ShoppingItem[]
  uncheckedCount: number
  pendingCount: number
  syncing: boolean
  addItems: (items: NewShoppingItem[]) => void
  toggle: (id: string) => void
  edit: (id: string, patch: ItemPatch) => void
  remove: (id: string) => void
  clearChecked: () => void
}

const TMP = 'tmp_'
const ShoppingContext = createContext<ShoppingValue | null>(null)
const EMPTY: Persisted = { items: [], queue: [], syncedAt: null }

// crypto.randomUUID is unavailable on plain-http LAN origins, so don't rely on it.
const tempId = () => `${TMP}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

interface Row {
  id: string
  item_name: string | null
  amount: number | string | null
  unit: string | null
  recipe_name: string | null
  is_checked: boolean | null
}

function slim(r: Row): ShoppingItem {
  return {
    id: r.id,
    item_name: r.item_name ?? '',
    amount: Number(r.amount ?? 0) || 0,
    unit: r.unit ?? '',
    recipe_name: r.recipe_name ?? '',
    is_checked: Boolean(r.is_checked),
  }
}

/** Local model → database columns (0 / "" become NULL). */
function toColumns(p: ItemPatch | NewShoppingItem): Record<string, unknown> {
  const out: Record<string, unknown> = { ...p }
  if ('amount' in p) out.amount = p.amount && p.amount > 0 ? p.amount : null
  if ('unit' in p) out.unit = p.unit ? p.unit : null
  return out
}

function applyOp(items: ShoppingItem[], op: PendingOp): ShoppingItem[] {
  switch (op.type) {
    case 'add':
      return [...items, { id: op.tempId, ...op.item, is_checked: false }]
    case 'update':
      return items.map((i) => (i.id === op.id ? { ...i, ...op.patch } : i))
    case 'delete':
      return items.filter((i) => i.id !== op.id)
  }
}

function enqueue(s: Persisted, op: PendingOp): Persisted {
  return { ...s, items: applyOp(s.items, op), queue: [...s.queue, op] }
}

/** Removing a never-synced item just cancels its pending operations. */
function removeItem(s: Persisted, id: string): Persisted {
  if (!id.startsWith(TMP)) return enqueue(s, { type: 'delete', id })
  return {
    ...s,
    items: s.items.filter((i) => i.id !== id),
    queue: s.queue.filter((o) => (o.type === 'add' ? o.tempId !== id : o.id !== id)),
  }
}

async function execute(op: PendingOp): Promise<ShoppingItem | null> {
  const table = db.from('shopping_list')
  switch (op.type) {
    case 'add': {
      const { data } = await table
        .insert({ ...toColumns(op.item), is_checked: false })
        .select()
        .single()
        .throwOnError()
      return slim(data as Row)
    }
    case 'update':
      await table.update(toColumns(op.patch)).eq('id', op.id).throwOnError()
      return null
    case 'delete':
      await table.delete().eq('id', op.id).throwOnError()
      return null
  }
}

export function ShoppingProvider({ children }: { children: ReactNode }) {
  const { showError } = useGlobalError()
  const online = useOnline()

  const [state, setState] = useState<Persisted>(() => readStore(STORE_KEYS.shopping, EMPTY))
  const [syncing, setSyncing] = useState(false)
  const stateRef = useRef(state)
  const flushing = useRef(false)

  const commit = useCallback((updater: (s: Persisted) => Persisted) => {
    const next = updater(stateRef.current)
    stateRef.current = next
    writeStore(STORE_KEYS.shopping, next)
    setState(next)
  }, [])

  const sync = useCallback(async () => {
    if (flushing.current || !navigator.onLine) return
    flushing.current = true
    setSyncing(true)
    try {
      // 1) flush pending operations in order
      while (stateRef.current.queue.length > 0) {
        const op = stateRef.current.queue[0]
        const refersToLocalOnlyItem = op.type !== 'add' && op.id.startsWith(TMP)
        try {
          const created = refersToLocalOnlyItem ? null : await execute(op)
          commit((s) => {
            let items = s.items
            let queue = s.queue.filter((o) => o !== op)
            if (op.type === 'add' && created) {
              items = items.map((i) => (i.id === op.tempId ? created : i))
              queue = queue.map((o) => (o.type !== 'add' && o.id === op.tempId ? { ...o, id: created.id } : o))
            }
            return { ...s, items, queue }
          })
        } catch (e) {
          if (isNetworkError(e)) return // try again when we are back online
          // Permanent failure (e.g. item already deleted elsewhere): drop the op.
          showError(toastMessage(e, t.errors.save))
          commit((s) => ({ ...s, queue: s.queue.filter((o) => o !== op) }))
        }
      }

      // 2) pull the server state and re-apply anything still pending
      const { data } = await db.from('shopping_list').select('*').order('created_at', { ascending: true }).throwOnError()
      const remote = ((data ?? []) as Row[]).map(slim)
      commit((s) => ({
        items: s.queue.reduce(applyOp, remote),
        queue: s.queue,
        syncedAt: Date.now(),
      }))
    } catch (e) {
      // offline / transient – retried on the next trigger
      if (!isNetworkError(e)) showError(toastMessage(e, t.errors.load))
    } finally {
      flushing.current = false
      setSyncing(false)
    }
  }, [commit, showError])

  // Triggers: coming online, new pending changes, tab focus, periodic retry.
  useEffect(() => {
    if (online) void sync()
  }, [online, sync])

  const pendingCount = state.queue.length
  useEffect(() => {
    if (online && pendingCount > 0) void sync()
  }, [pendingCount, online, sync])

  // Changes made while a sync was running (or a failed attempt): retry shortly after it ends.
  useEffect(() => {
    if (!online || pendingCount === 0 || syncing) return
    const id = window.setTimeout(() => void sync(), 5_000)
    return () => window.clearTimeout(id)
  }, [online, pendingCount, syncing, sync])

  useEffect(() => {
    const id = window.setInterval(() => void sync(), 60_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [sync])

  // ------------------------------------------------------------------ actions
  const addItems = useCallback(
    (incoming: NewShoppingItem[]) => {
      commit((s) => {
        let cur = s
        for (const item of incoming) {
          const name = normalize(item.item_name)
          const unit = item.unit.trim().toLowerCase()
          const existing = cur.items.find(
            (i) => !i.is_checked && normalize(i.item_name) === name && i.unit.trim().toLowerCase() === unit,
          )
          if (existing && existing.amount > 0 && item.amount > 0) {
            // same ingredient from another recipe: sum the amounts
            cur = enqueue(cur, { type: 'update', id: existing.id, patch: { amount: existing.amount + item.amount } })
          } else if (!(existing && existing.amount === 0 && item.amount === 0)) {
            // (an identical amount-less item already on the list is skipped)
            cur = enqueue(cur, { type: 'add', tempId: tempId(), item })
          }
        }
        return cur
      })
    },
    [commit],
  )

  const toggle = useCallback(
    (id: string) => {
      commit((s) => {
        const item = s.items.find((i) => i.id === id)
        if (!item) return s
        return enqueue(s, { type: 'update', id, patch: { is_checked: !item.is_checked } })
      })
    },
    [commit],
  )

  const edit = useCallback(
    (id: string, patch: ItemPatch) => commit((s) => enqueue(s, { type: 'update', id, patch })),
    [commit],
  )

  const remove = useCallback((id: string) => commit((s) => removeItem(s, id)), [commit])

  const clearChecked = useCallback(() => {
    commit((s) => s.items.filter((i) => i.is_checked).reduce((acc, i) => removeItem(acc, i.id), s))
  }, [commit])

  const value = useMemo<ShoppingValue>(
    () => ({
      items: state.items,
      uncheckedCount: state.items.filter((i) => !i.is_checked).length,
      pendingCount,
      syncing,
      addItems,
      toggle,
      edit,
      remove,
      clearChecked,
    }),
    [state.items, pendingCount, syncing, addItems, toggle, edit, remove, clearChecked],
  )
  return <ShoppingContext.Provider value={value}>{children}</ShoppingContext.Provider>
}

export function useShopping(): ShoppingValue {
  const ctx = useContext(ShoppingContext)
  if (!ctx) throw new Error('useShopping must be used inside ShoppingProvider')
  return ctx
}

