export type CostTier = 'CHEAP' | 'MODERATE' | 'EXPENSIVE'

/** JSONB payload for `recipes.ingredients` (not table columns). */
export interface Ingredient {
  name: string
  amount: number | null
  unit: string
}

export interface Recipe {
  id: string
  created_at: string
  updated_at: string | null
  title: string
  description: string | null
  image_url: string | null
  source_url: string | null
  source: string | null
  prep_time_minutes: number
  cook_time_minutes: number | null
  base_servings: number
  category: string | null
  cuisine: string | null
  difficulty: string | null
  cost_tier: CostTier
  tags: string[]
  ingredients: Ingredient[]
  steps: string[]
  notes: string | null
  is_favorite: boolean
  added_by: string | null
  last_cooked_at: string | null
  times_cooked: number
}

/** Fields the client may write to `recipes`. */
export interface RecipeInput {
  title: string
  description: string | null
  image_url: string | null
  source_url: string | null
  source: string | null
  prep_time_minutes: number
  cook_time_minutes: number | null
  base_servings: number
  category: string | null
  cuisine: string | null
  difficulty: string | null
  cost_tier: CostTier
  tags: string[]
  ingredients: Ingredient[]
  steps: string[]
  notes: string | null
  is_favorite: boolean
  added_by: string | null
}

export type RecipePatch = Partial<RecipeInput & { times_cooked: number; last_cooked_at: string | null }>

export interface RecipeRating {
  id: string
  recipe_id: string
  rating: number
  comment: string | null
  created_at: string
  rater_name: string | null
}

export interface PantryItem {
  id: string
  created_at: string
  item_name: string
  quantity: number
  unit: string
  category: string | null
  /** YYYY-MM-DD */
  expiry_date: string | null
  min_threshold: number | null
  added_by: string | null
  notes: string | null
}

export interface NewPantryItem {
  item_name: string
  quantity: number
  unit: string
  category: string | null
  expiry_date: string | null
  min_threshold: number | null
  added_by: string | null
  notes: string | null
}

export interface ShoppingItem {
  /** "tmp_..." while the item only exists locally (offline) */
  id: string
  created_at: string | null
  item_name: string
  /** 0 = no quantity */
  quantity: number
  unit: string
  category: string | null
  checked: boolean
  checked_by: string | null
  added_by: string | null
  source_recipe_id: string | null
  recipe_name: string | null
}

export interface NewShoppingItem {
  item_name: string
  quantity: number
  unit: string
  category: string | null
  checked: boolean
  added_by: string | null
  source_recipe_id: string | null
  recipe_name: string | null
}

export interface ScrapeResult {
  title: string
  source_url: string
  prep_time_minutes: number
  base_servings: number
  ingredients: Ingredient[]
  steps: string[]
  tags: string[]
  fallback: boolean
}
