import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { t } from '../strings'
import { useRecipes } from '../context/RecipesContext'
import { errorMessage } from '../lib/dbClient'
import { normalize, uniqueCreators, uniqueTags } from '../lib/recipes'
import { parseNumber } from '../lib/format'
import { scrapeRecipe } from '../utils/recipeScraper'
import { useGlobalError } from '../../../shared/ErrorContext'
import RatingStars from '../components/RatingStars'
import type { CostTier, Recipe, RecipeInput } from '../types'

interface IngredientRow {
  name: string
  amount: string
  unit: string
}

interface FormState {
  title: string
  added_by: string
  source_url: string
  prep_time_minutes: string
  base_servings: string
  cost_tier: CostTier
  rating: number
  tags: string[]
  ingredients: IngredientRow[]
  steps: string[]
}

const emptyRow = (): IngredientRow => ({ name: '', amount: '', unit: '' })

const emptyForm = (): FormState => ({
  title: '',
  added_by: '',
  source_url: '',
  prep_time_minutes: '',
  base_servings: '4',
  cost_tier: 'MODERATE',
  rating: 0,
  tags: [],
  ingredients: [emptyRow()],
  steps: [''],
})

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + 2}px`
}

const splitSteps = (s: string | null | undefined) =>
  (s ?? '').split('\n').map((l) => l.trim()).filter(Boolean)

function fromRecipe(r: Recipe): FormState {
  return {
    title: r.title,
    added_by: r.added_by ?? '',
    source_url: r.source_url ?? '',
    prep_time_minutes: r.prep_time_minutes ? String(r.prep_time_minutes) : '',
    base_servings: String(r.base_servings || 4),
    cost_tier: r.cost_tier,
    rating: r.rating ?? 0,
    tags: [...r.tags],
    ingredients: r.ingredients.map((i) => ({
      name: i.name,
      amount: i.amount ? String(i.amount) : '',
      unit: i.unit ?? '',
    })),
    steps: splitSteps(r.instructions).length ? splitSteps(r.instructions) : [''],
  }
}

function toInput(f: FormState): RecipeInput {
  const tags = [...new Set(f.tags.map((s) => normalize(s)).filter(Boolean))]
  return {
    title: f.title.trim(),
    added_by: f.added_by.trim() || null,
    source_url: f.source_url.trim() || null,
    prep_time_minutes: Math.round(parseNumber(f.prep_time_minutes)) || 30,
    base_servings: Math.max(1, Math.round(parseNumber(f.base_servings)) || 4),
    cost_tier: f.cost_tier,
    rating: f.rating > 0 ? f.rating : null,
    tags,
    ingredients: f.ingredients
      .filter((r) => r.name.trim())
      .map((r) => ({ name: r.name.trim(), amount: parseNumber(r.amount) || null, unit: r.unit.trim() })),
    instructions: f.steps
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n'),
  }
}

export default function RecipeFormPage() {
  const { id } = useParams()
  const { getById, loading } = useRecipes()
  const existing = id ? getById(id) : undefined

  if (id && !existing) {
    return (
      <div className="py-10 text-center text-muted">
        <p className="mb-4">{loading ? t.common.loading : t.recipe.notFound}</p>
        <Link to="/" className="btn-ghost">
          {t.recipe.back}
        </Link>
      </div>
    )
  }
  return <RecipeForm key={existing?.id ?? 'new'} existing={existing} />
}

function RecipeForm({ existing }: { existing?: Recipe }) {
  const navigate = useNavigate()
  const { recipes, create, update } = useRecipes()
  const { showError } = useGlobalError()
  const creators = useMemo(() => uniqueCreators(recipes), [recipes])
  const allTags = useMemo(() => uniqueTags(recipes), [recipes])

  const [form, setForm] = useState<FormState>(() => (existing ? fromRecipe(existing) : emptyForm()))
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importNote, setImportNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))

  function setRow(index: number, patch: Partial<IngredientRow>) {
    setForm((f) => ({ ...f, ingredients: f.ingredients.map((r, i) => (i === index ? { ...r, ...patch } : r)) }))
  }

  async function onImport(e: FormEvent) {
    e.preventDefault()
    const url = importUrl.trim()
    if (!url) return
    setImporting(true)
    setImportNote(null)
    try {
      const data = await scrapeRecipe(url)
      setForm((f) => ({
        ...f,
        title: data.title || f.title,
        source_url: data.source_url || url,
        prep_time_minutes: data.prep_time_minutes ? String(data.prep_time_minutes) : f.prep_time_minutes,
        base_servings: data.base_servings ? String(data.base_servings) : f.base_servings,
        tags: data.tags.length ? data.tags : f.tags,
        ingredients: data.ingredients.length
          ? data.ingredients.map((i) => ({
              name: i.name,
              amount: i.amount ? String(i.amount) : '',
              unit: i.unit ?? '',
            }))
          : f.ingredients,
        steps: data.steps.length ? data.steps : f.steps,
      }))
      setImportNote({ ok: !data.fallback, text: data.fallback ? t.scrape.fallback : t.scrape.done })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      showError(`Recept importálás sikertelen: ${reason}`)
      setImportNote({ ok: false, text: t.scrape.fallback })
    } finally {
      setImporting(false)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const input = toInput(form)
    if (!input.title) {
      setError(t.errors.requiredTitle)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const saved = existing ? await update(existing.id, input) : await create(input)
      navigate(`/receptek/${saved.id}`, { replace: true })
    } catch (err) {
      setError(errorMessage(err, t.errors.save))
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">{existing ? t.form.editTitle : t.form.newTitle}</h2>

      {!existing && (
        <form onSubmit={(e) => void onImport(e)} className="card space-y-3 bg-subtle p-5">
          <h3 className="text-lg font-bold">{t.scrape.title}</h3>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <label className="label" htmlFor="import-url">
                {t.scrape.urlLabel}
              </label>
              <input
                id="import-url"
                type="url"
                inputMode="url"
                className="input"
                placeholder={t.scrape.urlPlaceholder}
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-secondary self-end" disabled={importing || !importUrl.trim()}>
              {importing ? t.scrape.loading : t.scrape.button}
            </button>
          </div>
          {importNote && (
            <p className={`text-sm ${importNote.ok ? 'text-sage' : 'text-primary-hover'}`}>{importNote.text}</p>
          )}
        </form>
      )}

      <form onSubmit={(e) => void onSubmit(e)} className="card space-y-5 p-5">
        {!existing && <h3 className="text-lg font-bold">{t.scrape.manual}</h3>}

        <div>
          <label className="label" htmlFor="title">
            {t.form.title}
          </label>
          <input
            id="title"
            className="input"
            required
            maxLength={200}
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
          />
        </div>

        <div>
          <span className="label" id="added-by-label">
            {t.form.addedBy}
          </span>
          <div role="radiogroup" aria-labelledby="added-by-label" className="flex flex-wrap gap-2">
            {creators.map((c) => {
              const active = form.added_by === c
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => set('added_by', active ? '' : c)}
                  className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                    active
                      ? 'border-primary bg-primary text-white shadow-sm'
                      : 'border-line bg-surface text-ink hover:bg-subtle'
                  }`}
                >
                  👤 {c}
                </button>
              )
            })}
          </div>
          <input
            id="added-by"
            className="input mt-3"
            maxLength={60}
            placeholder="Más név…"
            aria-labelledby="added-by-label"
            value={creators.includes(form.added_by) ? '' : form.added_by}
            onChange={(e) => set('added_by', e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="prep">
              {t.form.prepTime}
            </label>
            <input
              id="prep"
              className="input"
              inputMode="numeric"
              value={form.prep_time_minutes}
              onChange={(e) => set('prep_time_minutes', e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="servings">
              {t.form.baseServings}
            </label>
            <input
              id="servings"
              className="input"
              inputMode="numeric"
              value={form.base_servings}
              onChange={(e) => set('base_servings', e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="cost">
              {t.form.costTier}
            </label>
            <select
              id="cost"
              className="input"
              value={form.cost_tier}
              onChange={(e) => set('cost_tier', e.target.value as CostTier)}
            >
              {(['CHEAP', 'MODERATE', 'EXPENSIVE'] as const).map((c) => (
                <option key={c} value={c}>
                  {t.cost[c]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <span className="label">{t.form.rating}</span>
          <RatingStars value={form.rating} onChange={(v) => set('rating', v)} />
        </div>

        <div>
          <label className="label" htmlFor="tags">
            {t.form.tags}
          </label>
          <TagPicker value={form.tags} options={allTags} onChange={(tags) => set('tags', tags)} />
        </div>

        <div>
          <label className="label" htmlFor="source">
            {t.form.sourceUrl}
          </label>
          <input
            id="source"
            type="url"
            inputMode="url"
            className="input"
            value={form.source_url}
            onChange={(e) => set('source_url', e.target.value)}
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="label">{t.form.ingredients}</legend>
          {form.ingredients.map((row, index) => (
            <div key={index} className="grid grid-cols-[4.5rem_5rem_1fr_auto] gap-2 sm:grid-cols-[6rem_6rem_1fr_auto]">
              <input
                className="input"
                inputMode="decimal"
                placeholder={t.form.amount}
                aria-label={t.form.amount}
                value={row.amount}
                onChange={(e) => setRow(index, { amount: e.target.value })}
              />
              <input
                className="input"
                placeholder={t.form.unit}
                aria-label={t.form.unit}
                value={row.unit}
                onChange={(e) => setRow(index, { unit: e.target.value })}
              />
              <input
                className="input"
                placeholder={t.form.ingredientName}
                aria-label={t.form.ingredientName}
                value={row.name}
                onChange={(e) => setRow(index, { name: e.target.value })}
              />
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-subtle"
                aria-label={t.form.removeIngredient}
                onClick={() =>
                  set(
                    'ingredients',
                    form.ingredients.length > 1 ? form.ingredients.filter((_, i) => i !== index) : [emptyRow()],
                  )
                }
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="btn-ghost" onClick={() => set('ingredients', [...form.ingredients, emptyRow()])}>
            {t.form.addIngredient}
          </button>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="label">{t.form.instructions}</legend>
          {form.steps.map((step, index) => (
            <div key={index} className="flex items-start gap-2">
              <span className="flex h-11 w-8 shrink-0 items-center justify-end font-bold text-primary">{index + 1}.</span>
              <textarea
                className="input min-h-11 resize-none overflow-hidden"
                rows={1}
                ref={(el) => autoGrow(el)}
                onInput={(e) => autoGrow(e.currentTarget)}
                aria-label={t.form.stepLabel(index + 1)}
                value={step}
                onChange={(e) => set('steps', form.steps.map((s, i) => (i === index ? e.target.value : s)))}
              />
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-subtle"
                aria-label={t.form.removeStep}
                onClick={() => set('steps', form.steps.length > 1 ? form.steps.filter((_, i) => i !== index) : [''])}
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="btn-ghost" onClick={() => set('steps', [...form.steps, ''])}>
            {t.form.addStep}
          </button>
        </fieldset>

        {error && <p className="rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary-hover">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" className="btn-primary flex-1 sm:flex-none" disabled={saving}>
            {saving ? t.form.saving : t.form.save}
          </button>
          <button type="button" className="btn-ghost" onClick={() => navigate(-1)}>
            {t.form.cancel}
          </button>
        </div>
      </form>
    </div>
  )
}

function TagPicker({ value, options, onChange }: { value: string[]; options: string[]; onChange: (tags: string[]) => void }) {
  const [text, setText] = useState('')
  const selected = new Set(value.map(normalize))
  const q = normalize(text)
  const suggestions = q ? options.filter((o) => normalize(o).includes(q) && !selected.has(normalize(o))).slice(0, 6) : []

  function addTag(raw: string) {
    const tag = normalize(raw)
    if (tag && !selected.has(tag)) onChange([...value, tag])
    setText('')
  }

  function toggle(tag: string) {
    const n = normalize(tag)
    onChange(selected.has(n) ? value.filter((v) => normalize(v) !== n) : [...value, n])
  }

  return (
    <div>
      <div className="input flex h-auto flex-wrap items-center gap-1.5 focus-within:border-primary">
        {value.map((tag) => (
          <span key={tag} className="chip border-primary bg-primary/10 text-primary">
            {tag}
            <button
              type="button"
              className="ml-1 cursor-pointer"
              aria-label={t.form.removeTag(tag)}
              onClick={() => toggle(tag)}
            >
              ✕
            </button>
          </span>
        ))}
        <input
          id="tags"
          className="min-w-32 flex-1 bg-transparent outline-none"
          placeholder={value.length ? '' : t.form.tagsPlaceholder}
          value={text}
          onChange={(e) => {
            const v = e.target.value
            if (v.includes(',')) v.split(',').slice(0, -1).forEach(addTag)
            else setText(v)
            if (v.includes(',')) setText(v.split(',').pop() ?? '')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTag(suggestions[0] && normalize(suggestions[0]).startsWith(q) ? suggestions[0] : text)
            } else if (e.key === 'Backspace' && !text && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
          onBlur={() => text.trim() && addTag(text)}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="chip cursor-pointer border-primary/40"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(s)}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
      {options.length > 0 && !q && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {options.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => toggle(o)}
              className={`chip cursor-pointer ${selected.has(normalize(o)) ? 'border-primary bg-primary/10 text-primary' : ''}`}
            >
              🏷️ {o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

