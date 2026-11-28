import { useState, type FormEvent } from 'react'
import { t } from '../strings'
import { useShopping } from '../context/ShoppingContext'
import { copyToClipboard, formatAmount, parseNumber, shoppingListToText } from '../lib/format'
import { useOnline } from '../hooks/useOnline'
import type { ShoppingItem } from '../types'

export default function ShoppingPage() {
  const { items, pendingCount, syncing, addItems, toggle, edit, remove, clearChecked } = useShopping()
  const online = useOnline()
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)

  const open = items.filter((i) => !i.checked)
  const done = items.filter((i) => i.checked)

  function onAdd(e: FormEvent) {
    e.preventDefault()
    const name = text.trim()
    if (!name) return
    addItems([
      {
        item_name: name,
        quantity: 0,
        unit: '',
        category: null,
        checked: false,
        added_by: null,
        source_recipe_id: null,
        recipe_name: t.shopping.manualItem,
      },
    ])
    setText('')
  }

  async function onCopy() {
    const ok = await copyToClipboard(shoppingListToText(items, t.shopping.listHeader))
    setCopied(ok)
    if (ok) window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-3xl font-bold">{t.shopping.title}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted">
          <span>{t.shopping.offlineSaved}</span>
          {(pendingCount > 0 || syncing) && (
            <span className="font-semibold text-sage">
              {online ? (syncing ? '⟳ ' : '') : '☁︎ '}
              {pendingCount > 0 ? t.shopping.pending(pendingCount) : ''}
            </span>
          )}
        </p>
      </header>

      <form onSubmit={onAdd} className="flex gap-2">
        <input
          className="input flex-1"
          placeholder={t.shopping.addPlaceholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={t.shopping.addPlaceholder}
        />
        <button type="submit" className="btn-primary shrink-0">
          {t.shopping.add}
        </button>
      </form>

      {items.length === 0 ? (
        <p className="card p-8 text-center text-muted">{t.shopping.empty}</p>
      ) : (
        <>
          <ul className="card divide-y divide-line overflow-hidden">
            {[...open, ...done].map((item) => (
              <Row key={item.id} item={item} onToggle={toggle} onEdit={edit} onRemove={remove} />
            ))}
          </ul>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" className="btn-secondary" onClick={() => void onCopy()} disabled={open.length === 0}>
              {copied ? t.shopping.copied : t.shopping.copy}
            </button>
            <button type="button" className="btn-danger" onClick={clearChecked} disabled={done.length === 0}>
              {t.shopping.clearChecked}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Row({
  item,
  onToggle,
  onEdit,
  onRemove,
}: {
  item: ShoppingItem
  onToggle: (id: string) => void
  onEdit: (id: string, patch: { item_name: string; quantity: number; unit: string }) => void
  onRemove: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState('')
  const qty = [item.quantity > 0 ? formatAmount(item.quantity) : '', item.unit].filter(Boolean).join(' ')

  function startEdit() {
    setName(item.item_name)
    setAmount(item.quantity > 0 ? formatAmount(item.quantity) : '')
    setUnit(item.unit)
    setEditing(true)
  }

  function onSave(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onEdit(item.id, { item_name: trimmed, quantity: parseNumber(amount) || 0, unit: unit.trim() })
    setEditing(false)
  }

  if (editing) {
    return (
      <li className="p-3">
        <form onSubmit={onSave} className="grid grid-cols-[1fr_5rem_5rem] gap-2">
          <input
            className="input col-span-3"
            aria-label={t.shopping.name}
            placeholder={t.shopping.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />
          <input
            className="input col-span-1"
            inputMode="decimal"
            aria-label={t.form.amount}
            placeholder={t.form.amount}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input
            className="input col-span-2"
            aria-label={t.form.unit}
            placeholder={t.form.unit}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
          <div className="col-span-3 flex gap-2">
            <button type="submit" className="btn-primary flex-1" disabled={!name.trim()}>
              {t.shopping.save}
            </button>
            <button type="button" className="btn-ghost flex-1" onClick={() => setEditing(false)}>
              {t.shopping.cancel}
            </button>
          </div>
        </form>
      </li>
    )
  }

  return (
    <li className="flex items-center gap-1">
      <label className="flex min-h-14 flex-1 cursor-pointer items-center gap-3 px-4 py-2">
        <input
          type="checkbox"
          className="h-6 w-6 shrink-0 accent-[var(--color-sage)]"
          checked={item.checked}
          onChange={() => onToggle(item.id)}
        />
        <span className={item.checked ? 'text-muted line-through' : ''}>
          <span className="font-semibold">{item.item_name}</span>
          {qty && <span className="text-muted"> · {qty}</span>}
          {item.recipe_name && <span className="block text-xs text-muted">{item.recipe_name}</span>}
        </span>
      </label>
      <button
        type="button"
        className="flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-subtle"
        onClick={startEdit}
        aria-label={t.shopping.edit}
      >
        ✎
      </button>
      <button
        type="button"
        className="mr-2 flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-subtle"
        onClick={() => onRemove(item.id)}
        aria-label="Törlés"
      >
        ✕
      </button>
    </li>
  )
}

