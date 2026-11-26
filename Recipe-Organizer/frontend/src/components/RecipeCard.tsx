import { Link } from 'react-router'
import { t } from '../strings'
import { daysSince } from '../lib/recipes'
import type { Recipe } from '../types'
import RatingStars from './RatingStars'

export default function RecipeCard({ recipe, note }: { recipe: Recipe; note?: string }) {
  const days = daysSince(recipe.last_cooked_at)
  return (
    <Link
      to={`/receptek/${recipe.id}`}
      className="card flex flex-col gap-2 p-4 transition-shadow hover:shadow-md active:bg-subtle"
    >
      <h3 className="text-lg font-bold leading-snug">{recipe.title}</h3>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        {recipe.prep_time_minutes > 0 && <span>⏱ {t.recipe.prepTime(recipe.prep_time_minutes)}</span>}
        <span>{t.cost[recipe.cost_tier]}</span>
      </div>

      {recipe.rating !== null && recipe.rating > 0 && <RatingStars value={recipe.rating} />}

      {recipe.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recipe.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="chip">
              {tag}
            </span>
          ))}
        </div>
      )}

      {note && <p className="text-xs font-semibold text-sage">{note}</p>}

      <p className="mt-auto flex flex-wrap items-center justify-between gap-x-3 pt-1 text-xs text-muted">
        <span>
          {recipe.times_cooked > 0 && days !== null
            ? `${t.recipe.cooked(recipe.times_cooked)} · ${t.recipe.lastCooked(days)}`
            : t.recipe.neverCooked}
        </span>
        {recipe.added_by && <span>{t.recipe.addedBy(recipe.added_by)}</span>}
      </p>
    </Link>
  )
}

