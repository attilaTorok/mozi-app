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

type ItemPatch = Partial<Pick<ShoppingItem, 'checked' | 'quantity' | 'unit' | 'item_name' | 'category' | 'checked_by'>>

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

const tempId = () => `${TMP}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

function slim(r: ShoppingItem): ShoppingItem {
  return {
    id: r.id,
    created_at: r.created_at ?? null,
    item_name: r.item_name ?? '',
    quantity: Number(r.quantity ?? 0) || 0,
    unit: r.unit ?? '',
    category: r.category ?? null,
    checked: Boolean(r.checked),
    checked_by: r.checked_by ?? null,
    added_by: r.added_by ?? null,
    source_recipe_id: r.source_recipe_id ?? null,
    recipe_name: r.recipe_name ?? null,
  }
}

function toColumns(p: ItemPatch | NewShoppingItem): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if ('item_name' in p && p.item_name !== undefined) out.item_name = p.item_name
  if ('quantity' in p && p.quantity !== undefined) out.quantity = p.quantity && p.quantity > 0 ? p.quantity : null
  if ('unit' in p && p.unit !== undefined) out.unit = p.unit ? p.unit : null
  if ('category' in p && p.category !== undefined) out.category = p.category
  if ('checked' in p && p.checked !== undefined) out.checked = Boolean(p.checked)
  if ('added_by' in p && p.added_by !== undefined) out.added_by = p.added_by
  if ('source_recipe_id' in p && p.source_recipe_id !== undefined) out.source_recipe_id = p.source_recipe_id
  if ('recipe_name' in p && p.recipe_name !== undefined) out.recipe_name = p.recipe_name
  if ('checked_by' in p && p.checked_by !== undefined) out.checked_by = p.checked_by
  return out
}

function applyOp(items: ShoppingItem[], op: PendingOp): ShoppingItem[] {
  switch (op.type) {
    case 'add':
      return [
        ...items,
        {
          id: op.tempId,
          created_at: null,
          item_name: op.item.item_name,
          quantity: op.item.quantity,
          unit: op.item.unit,
          category: op.item.category,
          checked: false,
          checked_by: null,
          added_by: op.item.added_by,
          source_recipe_id: op.item.source_recipe_id,
          recipe_name: op.item.recipe_name,
        },
      ]
    case 'update':
      return items.map((i) => (i.id === op.id ? { ...i, ...op.patch } : i))
    case 'delete':
      return items.filter((i) => i.id !== op.id)
  }
}

function enqueue(s: Persisted, op: PendingOp): Persisted {
  return { ...s, items: applyOp(s.items, op), queue: [...s.queue, op] }
}

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
        .insert({
          item_name: op.item.item_name,
          quantity: op.item.quantity && op.item.quantity > 0 ? op.item.quantity : null,
          unit: op.item.unit || null,
          category: op.item.category,
          checked: false,
          added_by: op.item.added_by,
          source_recipe_id: op.item.source_recipe_id,
          recipe_name: op.item.recipe_name,
        })
        .select()
        .single()
        .throwOnError()
      return slim(data as ShoppingItem)
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

  const [state, setState] = useState<Persisted>(() => {
    const stored = readStore(STORE_KEYS.shopping, EMPTY)
    return { ...stored, items: stored.items.map(slim) }
  })
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
          if (isNetworkError(e)) return
          showError(e, toastMessage(e, t.errors.save))
          commit((s) => ({ ...s, queue: s.queue.filter((o) => o !== op) }))
        }
      }

      const { data } = await db.from('shopping_list').select('*').order('created_at', { ascending: true }).throwOnError()
      const remote = ((data ?? []) as ShoppingItem[]).map(slim)
      commit((s) => ({
        items: s.queue.reduce(applyOp, remote),
        queue: s.queue,
        syncedAt: Date.now(),
      }))
    } catch (e) {
      if (!isNetworkError(e)) showError(e, toastMessage(e, t.errors.load))
    } finally {
      flushing.current = false
      setSyncing(false)
    }
  }, [commit, showError])

  useEffect(() => {
    if (online) void sync()
  }, [online, sync])

  const pendingCount = state.queue.length
  useEffect(() => {
    if (online && pendingCount > 0) void sync()
  }, [pendingCount, online, sync])

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

  const addItems = useCallback(
    (incoming: NewShoppingItem[]) => {
      commit((s) => {
        let cur = s
        for (const item of incoming) {
          const name = normalize(item.item_name)
          const unit = item.unit.trim().toLowerCase()
          const existing = cur.items.find(
            (i) => !i.checked && normalize(i.item_name) === name && i.unit.trim().toLowerCase() === unit,
          )
          if (existing && existing.quantity > 0 && item.quantity > 0) {
            cur = enqueue(cur, { type: 'update', id: existing.id, patch: { quantity: existing.quantity + item.quantity } })
          } else if (!(existing && existing.quantity === 0 && item.quantity === 0)) {
            cur = enqueue(cur, { type: 'add', tempId: tempId(), item: { ...item, checked: false } })
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
        return enqueue(s, { type: 'update', id, patch: { checked: !item.checked } })
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
    commit((s) => s.items.filter((i) => i.checked).reduce((acc, i) => removeItem(acc, i.id), s))
  }, [commit])

  const value = useMemo<ShoppingValue>(
    () => ({
      items: state.items,
      uncheckedCount: state.items.filter((i) => !i.checked).length,
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
