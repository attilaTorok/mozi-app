import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { t } from '../strings'
import { useRecipes } from '../context/RecipesContext'
import { usePantry } from '../context/PantryContext'
import { useShopping } from '../context/ShoppingContext'
import { useGlobalError } from '../../../shared/ErrorContext'
import { daysSince, findInPantry, localDateString } from '../lib/recipes'
import { formatAmount, formatIngredient, scaleAmount } from '../lib/format'
import { errorMessage } from '../lib/dbClient'
import RatingStars from '../components/RatingStars'
import type { Ingredient, NewShoppingItem, Recipe } from '../types'

function yesterdayOrToday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return localDateString(d)
}

export default function RecipeDetailPage() {
  const { id } = useParams()
  const { getById, loading } = useRecipes()
  const recipe = id ? getById(id) : undefined

  if (!recipe) {
    return (
      <div className="py-10 text-center text-muted">
        <p className="mb-4">{loading ? t.common.loading : t.recipe.notFound}</p>
        <Link to="/" className="btn-ghost">
          {t.recipe.back}
        </Link>
      </div>
    )
  }
  // key → servings state resets when navigating between recipes
  return <RecipeDetail key={recipe.id} recipe={recipe} />
}

function RecipeDetail({ recipe }: { recipe: Recipe }) {
  const navigate = useNavigate()
  const { logCooked, remove, update } = useRecipes()
  const { showError } = useGlobalError()
  const { items: pantry } = usePantry()
  const { addItems } = useShopping()

  const base = recipe.base_servings || 4
  const [servings, setServings] = useState(base)
  const [added, setAdded] = useState<Set<number>>(new Set())
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const dateRef = useRef<HTMLInputElement>(null)

  const ingredients = recipe.ingredients
  const days = daysSince(recipe.last_cooked_at)
  const steps = recipe.instructions.split('\n').map((s) => s.trim()).filter(Boolean)
  const [doneSteps, setDoneSteps] = useState<Set<number>>(new Set())

  function toggleStep(i: number) {
    setDoneSteps((prev) => {
      const next = new Set(prev)
      if (!next.delete(i)) next.add(i)
      return next
    })
  }

  function toShoppingItem(i: Ingredient): NewShoppingItem {
    return {
      item_name: i.name,
      amount: scaleAmount(i.amount, servings, base) ?? 0,
      unit: i.unit,
      recipe_name: recipe.title,
    }
  }

  function addOne(index: number) {
    addItems([toShoppingItem(ingredients[index])])
    setAdded((prev) => new Set(prev).add(index))
  }

  function addAll() {
    addItems(ingredients.map(toShoppingItem))
    setAdded(new Set(ingredients.map((_, i) => i)))
  }

  async function onCooked(cookedDate?: string) {
    setBusy(true)
    setMessage(null)
    try {
      const date = cookedDate && /^\d{4}-\d{2}-\d{2}$/.test(cookedDate) ? cookedDate : localDateString()
      await logCooked(recipe, date)
      setMessage(t.recipe.cookedLoggedOn(date))
      setPickerOpen(false)
    } catch (e) {
      showError(e, t.errors.save)
      setMessage(errorMessage(e, t.errors.save))
    } finally {
      setBusy(false)
    }
  }

  function onCookedAt(e: FormEvent) {
    e.preventDefault()
    void onCooked(dateRef.current?.value)
  }

  async function onRate(value: number) {
    setMessage(null)
    try {
      await update(recipe.id, { rating: value > 0 ? value : null })
    } catch (e) {
      setMessage(errorMessage(e, t.errors.save))
    }
  }

  async function onDelete() {
    if (!window.confirm(t.recipe.deleteConfirm)) return
    try {
      await remove(recipe.id)
      navigate('/', { replace: true })
    } catch (e) {
      setMessage(errorMessage(e, t.errors.save))
    }
  }

  return (
    <article className="space-y-6">
      <Link to="/" className="text-sm font-semibold text-sage hover:underline">
        {t.recipe.back}
      </Link>

      <header className="space-y-3">
        <h2 className="text-3xl font-bold leading-tight md:text-4xl">{recipe.title}</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          {recipe.prep_time_minutes > 0 && <span>⏱ {t.recipe.prepTime(recipe.prep_time_minutes)}</span>}
          <span>{t.cost[recipe.cost_tier]}</span>
          {recipe.added_by && <span>{t.recipe.addedBy(recipe.added_by)}</span>}
          {recipe.source_url && (
            <a href={recipe.source_url} target="_blank" rel="noreferrer noopener" className="font-semibold text-sage hover:underline">
              🔗 {t.recipe.source}
            </a>
          )}
        </div>
        <RatingStars value={recipe.rating ?? 0} onChange={(v) => void onRate(v)} />
        {recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {recipe.tags.map((tag) => (
              <span key={tag} className="chip">
                {tag}
              </span>
            ))}
          </div>
        )}
      </header>

      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void onCooked()}>
              {t.actions.logCooking}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              aria-expanded={pickerOpen}
              onClick={() => setPickerOpen((open) => !open)}
            >
              {t.actions.logCookingOn}
            </button>
          </div>
          {pickerOpen && (
            <form onSubmit={onCookedAt} className="mt-2 flex flex-wrap items-center gap-2">
              <input
                ref={dateRef}
                type="date"
                className="input w-auto"
                defaultValue={yesterdayOrToday()}
                max={localDateString()}
                aria-label={t.actions.logCookingOn}
                required
              />
              <button type="submit" className="btn-primary" disabled={busy}>
                {t.form.save}
              </button>
            </form>
          )}
          {message && <p className="mt-2 text-sm text-sage">{message}</p>}
        </div>
        <p className="text-sm text-muted">
          {recipe.times_cooked > 0 && days !== null
            ? `${t.recipe.cooked(recipe.times_cooked)} · ${t.recipe.lastCooked(days)}`
            : t.recipe.neverCooked}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-5">
        <section className="card p-5 md:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-xl font-bold">{t.recipe.ingredients}</h3>
            <div className="flex items-center gap-1" aria-label={t.actions.servings(String(servings))}>
              <button
                type="button"
                className="btn-ghost h-11 w-11 px-0 py-0 text-lg"
                onClick={() => setServings((s) => Math.max(1, s - 1))}
                aria-label="−"
              >
                －
              </button>
              <span className="min-w-16 text-center text-sm font-semibold">{t.actions.servings(String(servings))}</span>
              <button
                type="button"
                className="btn-ghost h-11 w-11 px-0 py-0 text-lg"
                onClick={() => setServings((s) => Math.min(99, s + 1))}
                aria-label="+"
              >
                ＋
              </button>
            </div>
          </div>

          {ingredients.length === 0 ? (
            <p className="text-sm text-muted">–</p>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {ingredients.map((ing, index) => {
                  const stock = findInPantry(ing.name, pantry)
                  return (
                    <li key={index} className="flex items-center justify-between gap-3 py-2">
                      <span>
                        {formatIngredient(ing, servings, base)}
                        {stock && (
                          <span className="block text-xs font-semibold text-sage">
                            {t.pantry.inStock(`${formatAmount(stock.amount)} ${stock.unit}`)}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 rounded-lg px-2 py-1.5 text-sm font-semibold text-primary hover:bg-primary/10 disabled:text-sage"
                        disabled={added.has(index)}
                        onClick={() => addOne(index)}
                      >
                        {added.has(index) ? t.shopping.added : t.actions.addToShopping}
                      </button>
                    </li>
                  )
                })}
              </ul>
              <button type="button" className="btn-primary mt-4 w-full" onClick={addAll}>
                {t.actions.addAllToShopping}
              </button>
            </>
          )}
        </section>

        <section className="card p-5 md:col-span-3">
          <h3 className="mb-4 text-xl font-bold">{t.recipe.instructions}</h3>
          {steps.length === 0 ? (
            <p className="text-sm text-muted">–</p>
          ) : (
            <ol className="space-y-2">
              {steps.map((step, i) => {
                const isDone = doneSteps.has(i)
                return (
                  <li key={i}>
                    <button
                      type="button"
                      aria-pressed={isDone}
                      onClick={() => toggleStep(i)}
                      className={`flex w-full cursor-pointer items-start gap-3 rounded-xl border p-3 text-left leading-relaxed transition-colors ${
                        isDone ? 'border-sage/30 bg-sage-soft/60 text-muted' : 'border-line bg-surface hover:bg-subtle'
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                          isDone ? 'bg-sage text-white' : 'bg-primary/10 text-primary'
                        }`}
                      >
                        {isDone ? '✓' : i + 1}
                      </span>
                      <span className={`pt-1 ${isDone ? 'line-through decoration-muted/60' : ''}`}>{step}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link to={`/receptek/${recipe.id}/szerkesztes`} className="btn-ghost">
          ✏️ {t.recipe.edit}
        </Link>
        <button type="button" className="btn-danger" onClick={() => void onDelete()}>
          🗑 {t.recipe.delete}
        </button>
      </div>
    </article>
  )
}

