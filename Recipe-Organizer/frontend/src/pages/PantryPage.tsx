import { useMemo, useState, type FormEvent } from 'react'
import { t } from '../strings'
import { usePantry } from '../context/PantryContext'
import { useShopping } from '../context/ShoppingContext'
import { expiryInfo, type ExpiryLevel } from '../lib/expiry'
import { formatAmount, parseNumber } from '../lib/format'
import { errorMessage } from '../lib/dbClient'
import { normalize } from '../lib/recipes'
import type { PantryItem } from '../types'

const UNITS = ['db', 'g', 'dkg', 'kg', 'ml', 'l', 'csomag'] as const

const badgeClass: Record<ExpiryLevel, string> = {
  urgent: 'bg-red-100 text-red-700',
  warning: 'bg-amber-100 text-amber-800',
  fresh: 'bg-sage-soft text-sage',
  none: 'bg-subtle text-muted',
}

export default function PantryPage() {
  const { items, loading, add, adjust, update, remove } = usePantry()
  const { addItems } = useShopping()

  const [search, setSearch] = useState('')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('1')
  const [unit, setUnit] = useState<string>('db')
  const [expires, setExpires] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const visible = useMemo(() => {
    const q = normalize(search)
    return q ? items.filter((i) => normalize(i.item_name).includes(q)) : items
  }, [items, search])

  async function run(action: () => Promise<void>) {
    setMessage(null)
    try {
      await action()
    } catch (e) {
      setMessage(errorMessage(e, t.errors.save))
    }
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    await run(async () => {
      const merged = await add({
        item_name: trimmed,
        amount: parseNumber(amount) || 1,
        unit,
        expires_at: expires || null,
      })
      if (merged) setMessage(t.pantry.merged(trimmed))
      setName('')
      setAmount('1')
      setExpires('')
    })
    setBusy(false)
  }

  async function onDepleted(item: PantryItem) {
    // Move to the shopping list (offline-capable) and drop the depleted pantry row.
    addItems([{ item_name: item.item_name, amount: 0, unit: '', recipe_name: t.shopping.manualItem }])
    await run(() => remove(item.id))
  }

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-3xl font-bold">{t.pantry.title}</h2>
        <p className="mt-1 text-sm text-muted">{t.pantry.subtitle}</p>
      </header>

      <form onSubmit={(e) => void onAdd(e)} className="card grid grid-cols-2 gap-2 bg-subtle p-4 sm:grid-cols-[1fr_5rem_6rem_10rem_auto]">
        <input
          className="input col-span-2 sm:col-span-1"
          placeholder={t.pantry.name}
          aria-label={t.pantry.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className="input"
          inputMode="decimal"
          placeholder={t.pantry.amount}
          aria-label={t.pantry.amount}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <select className="input" aria-label={t.pantry.unit} value={unit} onChange={(e) => setUnit(e.target.value)}>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <input
          className="input col-span-2 sm:col-span-1"
          type="date"
          title={t.pantry.expires}
          aria-label={t.pantry.expires}
          value={expires}
          onChange={(e) => setExpires(e.target.value)}
        />
        <button type="submit" className="btn-primary col-span-2 sm:col-span-1" disabled={busy || !name.trim()}>
          {t.pantry.add}
        </button>
        <p className="col-span-2 text-xs text-muted sm:col-span-5">{t.pantry.expires}</p>
      </form>

      {message && <p className="rounded-xl bg-sage-soft px-3 py-2 text-sm text-sage">{message}</p>}

      <input
        type="search"
        className="input"
        placeholder={t.pantry.search}
        aria-label={t.pantry.search}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading && items.length === 0 ? (
        <p className="py-10 text-center text-muted">{t.common.loading}</p>
      ) : items.length === 0 ? (
        <p className="card p-8 text-center text-muted">{t.pantry.empty}</p>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-muted">{t.pantry.noResults}</p>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {visible.map((item) => {
            const expiry = expiryInfo(item.expires_at)
            return (
              <li key={item.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{item.item_name}</p>
                  <div className="mt-1 flex items-center gap-1">
                    <label
                      className={`relative inline-block cursor-pointer rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass[expiry.level]}`}
                    >
                      📅 {expiry.label}
                      <input
                        type="date"
                        className="absolute inset-0 cursor-pointer opacity-0"
                        aria-label={t.pantry.expires}
                        value={item.expires_at ?? ''}
                        onChange={(e) => void run(() => update(item.id, { expires_at: e.target.value || null }))}
                      />
                    </label>
                    {item.expires_at && (
                      <button
                        type="button"
                        className="rounded-full px-1.5 text-xs text-muted hover:bg-subtle"
                        aria-label={t.pantry.clearExpiry}
                        title={t.pantry.clearExpiry}
                        onClick={() => void run(() => update(item.id, { expires_at: null }))}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1 sm:contents">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="btn-ghost h-11 w-11 px-0 text-lg"
                    aria-label={t.pantry.decrease}
                    disabled={item.amount <= 0}
                    onClick={() => void run(() => adjust(item.id, -1))}
                  >
                    －
                  </button>
                  <AmountInput
                    key={item.amount}
                    value={item.amount}
                    unit={item.unit}
                    onSave={(amount) => void run(() => update(item.id, { amount }))}
                  />
                  <button
                    type="button"
                    className="btn-ghost h-11 w-11 px-0 text-lg"
                    aria-label={t.pantry.increase}
                    onClick={() => void run(() => adjust(item.id, 1))}
                  >
                    ＋
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded-lg px-2 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
                    onClick={() => void onDepleted(item)}
                  >
                    {t.pantry.toShopping}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg px-2 py-2 text-sm text-muted hover:bg-subtle"
                    onClick={() => void run(() => remove(item.id))}
                  >
                    {t.pantry.remove}
                  </button>
                </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function AmountInput({ value, unit, onSave }: { value: number; unit: string; onSave: (amount: number) => void }) {
  const [text, setText] = useState(formatAmount(value))

  function commit() {
    const n = parseNumber(text)
    if (!Number.isFinite(n) || n < 0 || text.trim() === '') {
      setText(formatAmount(value))
      return
    }
    if (n !== value) onSave(n)
  }

  return (
    <span className="flex items-center gap-1">
      <input
        className="input w-20 px-2 text-center font-semibold"
        inputMode="decimal"
        aria-label={t.pantry.amount}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
      <span className="min-w-8 text-sm font-semibold text-muted">{unit}</span>
    </span>
  )
}

