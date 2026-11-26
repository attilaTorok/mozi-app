import { useState } from 'react'
import { t } from '../strings'
import { useRecipes } from '../context/RecipesContext'
import { usePantry } from '../context/PantryContext'
import { pantryRescue, pickRandom, sortRecipes } from '../lib/recipes'
import RecipeCard from '../components/RecipeCard'
import type { Recipe } from '../types'

type Mode = 'random' | 'dormant' | 'quick' | 'rescue'

interface Result {
  recipe: Recipe
  note?: string
}

export default function SuggestPage() {
  const { recipes } = useRecipes()
  const { items: pantry } = usePantry()
  const [mode, setMode] = useState<Mode | null>(null)
  const [results, setResults] = useState<Result[]>([])

  function run(next: Mode) {
    setMode(next)
    switch (next) {
      case 'random':
        setResults(pickRandom(recipes, 3).map((recipe) => ({ recipe })))
        break
      case 'dormant':
        // never cooked or cooked longest ago first
        setResults(sortRecipes(recipes, 'dormant').slice(0, 3).map((recipe) => ({ recipe })))
        break
      case 'quick':
        setResults(
          pickRandom(
            recipes.filter((r) => r.prep_time_minutes <= 30),
            3,
          ).map((recipe) => ({ recipe })),
        )
        break
      case 'rescue':
        setResults(
          pantryRescue(recipes, pantry).map(({ recipe, uses }) => ({
            recipe,
            note: t.suggest.rescueUses(uses.join(', ')),
          })),
        )
        break
    }
  }

  const buttons: { mode: Mode; label: string; className: string }[] = [
    { mode: 'random', label: t.suggest.random, className: 'btn-primary' },
    { mode: 'dormant', label: t.suggest.dormant, className: 'btn-secondary' },
    { mode: 'quick', label: t.suggest.quick, className: 'btn-ghost' },
    { mode: 'rescue', label: t.suggest.pantryRescue, className: 'btn-ghost' },
  ]

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">{t.suggest.title}</h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {buttons.map((b) => (
          <button
            key={b.mode}
            type="button"
            className={`${b.className} ${mode === b.mode ? 'ring-2 ring-primary/40' : ''}`}
            onClick={() => run(b.mode)}
          >
            {b.label}
          </button>
        ))}
      </div>

      {mode === 'rescue' && <p className="text-sm text-muted">{t.suggest.rescueInfo}</p>}

      {mode === null ? (
        <p className="py-6 text-center text-muted">{t.suggest.hint}</p>
      ) : results.length === 0 ? (
        <p className="py-6 text-center text-muted">{t.suggest.empty}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((r) => (
            <RecipeCard key={r.recipe.id} recipe={r.recipe} note={r.note} />
          ))}
        </div>
      )}
    </div>
  )
}

