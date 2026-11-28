import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { t } from '../strings'
import { useRecipes } from '../context/RecipesContext'
import { filterRecipes, findDormant, sortRecipes, uniqueCreators, uniqueTags, type SortKey } from '../lib/recipes'
import RecipeCard from '../components/RecipeCard'
import type { CostTier } from '../types'

const sortOptions: { key: SortKey; label: string }[] = [
  { key: 'name', label: t.sort.name },
  { key: 'dormant', label: t.sort.dormant },
  { key: 'mostCooked', label: t.sort.mostCooked },
  { key: 'rating', label: t.sort.rating },
  { key: 'fastest', label: t.sort.fastest },
]

export default function RecipesPage() {
  const { recipes, ratings, loading } = useRecipes()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('name')
  const [tag, setTag] = useState('')
  const [creator, setCreator] = useState('')
  const [cost, setCost] = useState<CostTier | ''>('')

  const visible = useMemo(
    () => sortRecipes(filterRecipes(recipes, { query, tag, creator, cost }), sort, ratings),
    [recipes, ratings, query, tag, creator, cost, sort],
  )
  const dormant = useMemo(() => findDormant(recipes), [recipes])
  const tags = useMemo(() => uniqueTags(recipes), [recipes])
  const creators = useMemo(() => uniqueCreators(recipes), [recipes])

  return (
    <div className="space-y-5">
      {dormant && (
        <Link
          to={`/receptek/${dormant.recipe.id}`}
          className="block rounded-2xl border border-sage/30 bg-sage-soft px-4 py-3 text-sage hover:bg-sage-soft/70"
        >
          <p className="text-xs font-bold uppercase tracking-wide">{t.dormant.title}</p>
          <p className="font-heading text-lg font-bold">{dormant.recipe.title}</p>
          <p className="text-sm">{t.dormant.meta(dormant.days, dormant.recipe.times_cooked)}</p>
          <p className="mt-1 text-sm font-semibold">{t.dormant.view}</p>
        </Link>
      )}

      <section className="card space-y-3 p-4 sm:p-5" aria-label={t.common.search}>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="search"
            className="input flex-1"
            placeholder={t.search.placeholder}
            aria-label={t.common.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="input sm:w-64"
            aria-label={t.common.sortBy}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            {sortOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <p className="px-1 text-sm text-muted">{t.search.pantryTip}</p>

        <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-3">
          <select className="input" aria-label={t.search.allTags} value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">{t.search.allTags}</option>
            {tags.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          <select
            className="input"
            aria-label={t.search.allCreators}
            value={creator}
            onChange={(e) => setCreator(e.target.value)}
          >
            <option value="">{t.search.allCreators}</option>
            {creators.map((x) => (
              <option key={x} value={x}>
                👤 {x}
              </option>
            ))}
          </select>
          <select
            className="input"
            aria-label={t.search.allCosts}
            value={cost}
            onChange={(e) => setCost(e.target.value as CostTier | '')}
          >
            <option value="">{t.search.allCosts}</option>
            {(['CHEAP', 'MODERATE', 'EXPENSIVE'] as const).map((c) => (
              <option key={c} value={c}>
                {t.cost[c]}
              </option>
            ))}
          </select>
        </div>
      </section>

      {loading && recipes.length === 0 ? (
        <p className="py-10 text-center text-muted">{t.common.loading}</p>
      ) : recipes.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="mb-4 text-muted">{t.recipe.empty}</p>
          <Link to="/uj-recept" className="btn-primary">
            {t.nav.newRecipe}
          </Link>
        </div>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-muted">{t.recipe.noResults}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      )}
    </div>
  )
}
