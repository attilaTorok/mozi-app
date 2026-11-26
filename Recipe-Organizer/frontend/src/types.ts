export type CostTier = 'CHEAP' | 'MODERATE' | 'EXPENSIVE'

export interface Ingredient {
  name: string
  amount: number | null
  unit: string
}

export interface Recipe {
  id: string
  title: string
  added_by: string | null
  source_url: string | null
  prep_time_minutes: number
  base_servings: number
  cost_tier: CostTier
  rating: number | null
  tags: string[]
  ingredients: Ingredient[]
  instructions: string
  times_cooked: number
  last_cooked_at: string | null
  created_at: string
}

/** Fields the client may write. */
export interface RecipeInput {
  title: string
  added_by: string | null
  source_url: string | null
  prep_time_minutes: number
  base_servings: number
  cost_tier: CostTier
  rating: number | null
  tags: string[]
  ingredients: Ingredient[]
  instructions: string
}

export type RecipePatch = Partial<RecipeInput & { times_cooked: number; last_cooked_at: string | null }>

export interface PantryItem {
  id: string
  item_name: string
  amount: number
  unit: string
  /** YYYY-MM-DD */
  expires_at: string | null
  updated_at: string
}

export interface NewPantryItem {
  item_name: string
  amount: number
  unit: string
  expires_at: string | null
}

export interface ShoppingItem {
  /** "tmp_..." while the item only exists locally (offline) */
  id: string
  item_name: string
  /** 0 = no amount */
  amount: number
  unit: string
  recipe_name: string
  is_checked: boolean
}

export interface NewShoppingItem {
  item_name: string
  amount: number
  unit: string
  recipe_name: string
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

