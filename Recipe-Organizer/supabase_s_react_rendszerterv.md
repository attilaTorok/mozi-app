# Recipe Organizer & Kitchen Inventory – Serverless System Specification
**Architecture:** Backendless (Database + Static Frontend + Edge Proxy)  
**Database & Auth:** Phase 1: Local Docker PostgreSQL (+ PostgREST) | Phase 2: Supabase Cloud  
**Frontend & Hosting:** React (Vite + TypeScript + Tailwind CSS + PWA) on Cloudflare Pages  
**Design System:** Nordic Cozy UI (Hungarian Language UI Copy)

---

## 1. Architectural Strategy & Phased Rollout

This system eliminates custom backend servers (no Java, Go, or Node REST APIs to maintain). Because the application is strictly private to a single couple/household (and will later be merged into a private family hub), **multi-tenancy, user profiles, and household invite systems are completely omitted**. This keeps the database schema flat, fast, and effortless to maintain.

```
+-----------------------------------------------------------------------------------+
| PHASE 1: LOCAL DOCKER MVP (Zero Cloud Dependency, Instant Testing)                |
|                                                                                   |
|  [ React (Vite) PWA ]  <------>  [ PostgREST ]  <------>  [ PostgreSQL 16 ]       |
|  Port: 5173                      Port: 3000               Port: 5432 (init.sql)   |
|  (Direct Anonymous Dev Role & Local Scrape Proxy)                                 |
+-----------------------------------------------------------------------------------+
                                        │
                                        ▼ Phase 2: Swap .env keys & deploy
+-----------------------------------------------------------------------------------+
| PHASE 2: CLOUD PRODUCTION (Zero-Cost / Free Tier)                                 |
|                                                                                   |
|  [ Cloudflare Pages ]  <------------------------------>  [ Supabase Cloud ]       |
|  • Static React PWA                                       • Managed PostgreSQL    |
|  • /functions/api/scrape.ts (CORS-free URL parser)        • Single Shared Login   |
+-----------------------------------------------------------------------------------+
```

### 1.1. Why PostgREST in Phase 1?
Supabase uses **PostgREST** under the hood to expose PostgreSQL tables directly as a REST API. By running `postgres:16-alpine` alongside `postgrest/postgrest` in local Docker Compose:
* You write **zero backend code** in Phase 1.
* The frontend uses the exact same `@supabase/supabase-js` query patterns locally as it will in production.
* You can freely tweak tables, columns, and sample data in `init.sql` before migrating to Supabase Cloud.

### 1.2. Phase 1 vs. Phase 2 Authentication Strategy
The frontend uses an environment variable `VITE_APP_MODE=local | supabase`:
* **`local` (Phase 1 Docker MVP):** Bypasses login completely; connects directly to local PostgREST so you can immediately test recipes, the pantry inventory ("Raktár"), and the shopping list.
* **`supabase` (Phase 2 Production):** Uses a single shared household account in Supabase Auth (Email/Password created once in the Supabase Dashboard, with public sign-ups disabled). Both partners log in once on their phones; Supabase persists the session token in `localStorage` indefinitely. Row Level Security (RLS) simply restricts all table access to `authenticated` users, keeping strangers out with zero profile/household tables.

---

## 2. Database Schema, RLS & Seed Data (`db/init.sql`)

The AI coding agent must generate a single `db/init.sql` file that initializes the database in Phase 1 Docker and can be pasted directly into the Supabase SQL Editor in Phase 2.

### 2.1. Core Tables

#### `recipes`
Stores all household recipes, cooking history, and the free-text creator name.
* `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
* `title`: `TEXT NOT NULL`
* `added_by`: `TEXT` (Nullable free-text creator name, e.g., `"Attila"`, `"Bogi"`)
* `source_url`: `TEXT`
* `prep_time_minutes`: `INTEGER NOT NULL DEFAULT 30`
* `base_servings`: `INTEGER NOT NULL DEFAULT 4`
* `cost_tier`: `TEXT NOT NULL DEFAULT 'MODERATE' CHECK (cost_tier IN ('CHEAP', 'MODERATE', 'EXPENSIVE'))`
* `rating`: `INTEGER CHECK (rating >= 1 AND rating <= 5)`
* `tags`: `JSONB NOT NULL DEFAULT '[]'::jsonb` — Normalized lowercase string array: `["gyors", "mexikói", "csirke"]`
* `ingredients`: `JSONB NOT NULL DEFAULT '[]'::jsonb` — Structured array: `[{"name": "Csirkemellfilé", "amount": 500, "unit": "g"}]`
* `instructions`: `TEXT NOT NULL`
* `times_cooked`: `INTEGER NOT NULL DEFAULT 0`
* `last_cooked_at`: `TIMESTAMPTZ`
* `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`

#### `pantry_items` (Raktár / Konyhai Készlet)
Tracks what ingredients and products are currently available at home, along with the **single nearest expiration date** so either partner can check stock while away from home.
* `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
* `item_name`: `TEXT NOT NULL` (e.g., *"Cottage cheese"*)
* `amount`: `NUMERIC(8, 2) NOT NULL DEFAULT 1` (e.g., `5`)
* `unit`: `TEXT NOT NULL DEFAULT 'db'` (e.g., *"db"*, *"g"*, *"dkg"*, *"ml"*, *"l"*, *"csomag"*)
* `expires_at`: `DATE` (Nullable; stores the single earliest/nearest expiration date, e.g., `'2026-11-30'`)
* `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`

#### `shopping_list`
* `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
* `item_name`: `TEXT NOT NULL`
* `amount`: `NUMERIC(8, 2)`
* `unit`: `TEXT`
* `recipe_name`: `TEXT DEFAULT 'Kézi tétel'`
* `is_checked`: `BOOLEAN NOT NULL DEFAULT false`
* `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`

### 2.2. Row Level Security (RLS) Policies (For Phase 2 Supabase)
Include these simplified single-household policies in `init.sql` (commented out for Phase 1 local PostgREST anonymous dev role, and enabled in Phase 2 Supabase):
```sql
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pantry_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated household access on recipes" ON recipes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated household access on pantry_items" ON pantry_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated household access on shopping_list" ON shopping_list
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

### 2.3. Initial Seed Data (`db/init.sql`)
Populate `init.sql` with:
* **4–5 authentic Hungarian recipes** with varied `added_by` values (e.g., `'Attila'`, `'Bogi'`) and varied `last_cooked_at` timestamps (including one >30 days ago to test the Dormant Recipe banner):
  * *Chilis-Lime-os Csirkemell*, *Sajtos-Tejfölös Tepsis Karaj*, *Vargányás Tejszínes Tagliatelle*, *Krémes Vöröslencse Dhal*.
* **5–6 realistic `pantry_items` records** (e.g., *Cottage cheese* — `5 db` — expiring in 4 days; *Csirkemellfilé* — `800 g` — expiring in 2 days; *Tejföl 20%* — `1 db` — expiring in 9 days; *Vöröslencse* — `500 g` — `expires_at: NULL`).

---

## 3. Serverless Recipe URL Scraping (No Backend)

Since there is no custom backend server, recipe URL importing is handled via lightweight HTML fetching + client-side Schema.org parsing:

1. **Fetch Layer:**
   * **Phase 1 (Local Vite):** Configure a Vite server proxy (`/api/scrape`) or fallback CORS proxy (`https://api.allorigins.win/get?url=...`) to fetch raw HTML from the target recipe URL.
   * **Phase 2 (Cloudflare Pages):** Include a single **Cloudflare Pages Function** at `frontend/functions/api/scrape.ts`. Cloudflare Pages deploys this automatically alongside the static React app at `0 Ft` cost, fetching the URL with a standard desktop `User-Agent` header.
2. **Parser Layer (`src/utils/recipeScraper.ts`):**
   * Parses the returned HTML string using the browser's native `DOMParser`.
   * Searches all `<script type="application/ld+json">` tags for `@type: "Recipe"` (handling both direct objects and `@graph` arrays used on sites like Nosalty, Street Kitchen, Mindmegette).
   * Extracts `name`, `recipeIngredient` (parsed into `{ amount, unit, name }`), `recipeInstructions`, and `totalTime` / `prepTime`.
   * **Graceful Fallback:** If a site blocks scraping (403) or lacks JSON-LD, pre-fills `source_url` and extracts a clean title from `<title>` or the URL slug so the user can quickly enter the ingredients manually.

---

## 4. Core Functional Specifications

### 4.1. Recipe Management & Smart "Added By" Autocomplete
* **Create / Edit / Delete:** Full CRUD form supporting manual entry or URL import.
* **Free-Text + Autocomplete Creator Field (`added_by`):**
  * When adding or editing a recipe, an input labeled *"Ki adta hozzá?"* allows typing any free-text name (e.g., `"Attila"`).
  * The frontend queries all unique non-empty `added_by` values already saved in `recipes` and displays them both as **one-tap quick-select chips** right below the input and via native `<datalist>` autocomplete. Once `"Attila"` is used on a first recipe, on all subsequent recipes it can be selected with a single tap or typed freely if a new name is desired.
  * Recipe cards and detail modals subtly display the creator badge (e.g., `👤 Attila`).
* **Serving Size Scaler:** On the recipe detail modal, `＋` and `－` buttons dynamically recalculate ingredient quantities proportionally to `base_servings`.
* **Cooking History ("Megfőztük ma!"):** One-tap action increments `times_cooked` by 1 and updates `last_cooked_at` to `now()`.
* **Star Rating:** Interactive 1–5 star selector saved immediately to the database.

### 4.2. Kitchen Inventory / Pantry ("Raktár")
A dedicated top-level navigation tab (**"📦 Raktár"**) designed for checking what is currently in the kitchen when away from home (e.g., at the grocery store) and tracking nearest expiration dates:
* **Quick Add Form:** Compact inline bar with:
  * Item name (`item_name`, e.g., *"Cottage cheese"*)
  * Quantity (`amount`, e.g., `5`) + Unit selector (`db`, `g`, `dkg`, `kg`, `ml`, `l`, `csomag`)
  * Nearest expiration date (`expires_at`, optional date picker, e.g., `2026-11-30`)
  * *Smart Merge Option:* If an item with the exact same name already exists in `pantry_items`, offer a quick update or let the user update its quantity and nearest expiration date.
* **Expiration Date Visual Indicators & Sorting:**
  * Default sort orders items with the **soonest expiration date first** (`expires_at ASC NULLS LAST`), followed by alphabetical order.
  * **Color-coded Expiry Badges:**
    * **Expired (`< today`) or Urgent (`0–3 days`):** Red badge (*"Lejárt!"* / *"Ma lejár"* / *"2 nap múlva lejár"*).
    * **Warning (`4–7 days`):** Warm amber badge (*"5 nap múlva lejár"*).
    * **Fresh (`> 7 days`):** Sage green/neutral date label (e.g., *"Lejárat: 2026. 11. 30."*).
    * **No Expiry (`NULL`):** Subtle *"Nincs lejárat"* label (for dry goods like pasta, rice, spices).
* **One-Tap Stock Adjustments & Grocery Integration:**
  * **Quick `－` / `＋` Stepper Buttons:** Directly on each pantry row, tapping `－` decrements `amount` by 1 (e.g., `5 db` $\rightarrow$ `4 db`) so updating stock after cooking takes one tap.
  * **Depleted / Move to Shopping List (`🛒 Listára`):** One-tap button adds the item to `shopping_list` (and optionally deletes or zeroes out the depleted pantry row).
  * **Instant Supermarket Search & Offline Cache:** Mirrors `pantry_items` to `localStorage` (just like the shopping list) with an instant search bar so you can check from the store aisle whether you still have cottage cheese at home, even with poor mobile reception.
* **Recipe Cross-Reference (Bonus Synergy):**
  * On the Recipe Detail Modal, ingredients that match an item currently in `pantry_items` (with `amount > 0`) display a subtle green indicator (*"✓ Van otthon: 5 db"*), helping avoid unnecessary shopping list additions.

### 4.3. Search, Pantry Filtering & Recommendations
* **Multi-Criteria Filtering:** Filter simultaneously by search text, selected tag chip, creator (`added_by`), and cost tier (`CHEAP`, `MODERATE`, `EXPENSIVE`).
* **Pantry Ingredient Search:** Typing comma-separated ingredients (e.g., `csirke, tejföl`) matches recipes whose `ingredients` JSONB contains **all** entered ingredients.
* **Sorting:** Alphabetical (`A-Z`), Least Recently Cooked (`Rég főztük előre`), Most Cooked (`Legtöbbször főzött`), Highest Rated, and Quickest.
* **Dormant Recipe Highlight:** Top banner highlighting the recipe with the oldest `last_cooked_at` date (if > 21 days ago).
* **Meal Recommender ("Mit főzzek?"):**
  * *3 Véletlen Étel:* Picks 3 random recipes.
  * *Rég Nem Főzött:* Picks the 3 recipes cooked longest ago (or never cooked).
  * *Gyors Vacsorák (<30p):* Picks 3 random recipes with `prep_time_minutes <= 30`.
  * *Raktár-mentő (Hamarosan lejárókból):* Suggests recipes that use ingredients currently in `pantry_items` with the nearest `expires_at` dates.

### 4.4. Offline-First PWA Grocery Shopping List
* **Dual-Storage Architecture:**
  * Every change (adding recipe ingredients, adding a manual item, checking/unchecking, clearing checked items) writes **immediately** to `localStorage` for instant UI response in supermarkets.
  * Synchronizes asynchronously to the `shopping_list` table when online.
* **Clipboard Export:** A *"📋 Másolás"* button formats unchecked items as a clean bulleted list and copies it to the device clipboard.

---

## 5. Frontend Design & Hungarian UI Dictionary

### 5.1. Nordic Cozy Design System
* **Background Canvas:** `#FAF7F2` (Warm Linen)
* **Card Surface:** `#FFFFFF` with border `#E6DFD5` and soft shadow `0 4px 20px -2px rgba(90, 70, 50, 0.07)`
* **Subtle Surface:** `#F4EFE6` (Oatmeal)
* **Primary Brand Color:** `#C85A32` (Warm Terracotta), Hover `#AF4924`, Light tint `#FCEEE8`
* **Secondary Accent:** `#3F6250` (Kitchen Sage Green), Light tint `#EBF2EE`
* **Typography:** `Playfair Display` (Google Font, Serif) for headings + `Plus Jakarta Sans` (Sans-serif) for UI controls and body text.
* **Responsive Layout:** Desktop top navigation bar + 3-column recipe grid; Mobile bottom navigation dock + single-column touch-friendly cards.

### 5.2. Mandatory Hungarian UI Copy Dictionary
All user-facing text in the React application must be in natural Hungarian:

| UI Element | Hungarian Copy |
| :--- | :--- |
| **App Title & Subtitle** | *Kandalló & Konyha* — *Közös recepttár és konyhai készlet* |
| **Navigation Tabs** | *Receptek* \| *🎲 Mit főzzek?* \| *📦 Raktár* \| *🛒 Bevásárlás* \| *＋ Új Recept* |
| **Search Input Placeholder** | *Recept neve vagy hozzávaló (pl. csirke, tejszín)...* |
| **Cost Tier Labels** | `CHEAP`: *💰 Pénztárcabarát* \| `MODERATE`: *💰💰 Közepes* \| `EXPENSIVE`: *💰💰💰 Ünnepi* |
| **Sort Dropdown** | *Név szerint (A-Z)* \| *Rég főztük előre ⏳* \| *Legtöbbször főzött ⭐* \| *Értékelés szerint* \| *Leggyorsabb* |
| **Dormant Banner** | *Elfeledett kedvenc* — *Utoljára: X napja • Eddig Yx főzve* — *Recept megtekintése →* |
| **Recipe Card & Modal Meta** | *👤 Hozzáadta: [Név]* \| *✓ Van otthon: [Mennyiség]* \| *🛒 Listára* \| *👨‍🍳 Főztem* |
| **Recipe Detail Modal** | *Hozzávalók* \| *[X] adag* \| *🛒 Mind a listára* \| *Elkészítés* \| *👨‍🍳 Megfőztük ma!* |
| **New Recipe Modal** | *Új Recept Rögzítése* \| *✍️ Kézi Felvitel* \| *🔗 Importálás Weboldalról* \| *Ki adta hozzá? (pl. Attila)* |
| **Pantry ("Raktár") Screen** | *Konyhai Raktár* \| *Mi van otthon és mi jár le hamarosan* \| *Keresés a raktárban...* |
| **Pantry Form Placeholders** | *Termék neve (pl. Cottage cheese)* \| *Menny.* \| *Legközelebbi lejárat* \| *＋ Raktárba* |
| **Pantry Expiry Badges** | *Lejárt!* \| *Ma lejár!* \| *[X] nap múlva lejár* \| *Lejárat: [ÉÉÉÉ. HH. NN.]* \| *Nincs lejárat* |
| **Pantry Item Actions** | *🛒 Elfogyott → Listára* \| *Törlés* |
| **Recommender Screen** | *Mit főzzünk ma?* \| *✨ 3 Véletlen Étel* \| *⏳ Rég Nem Főzött* \| *⚡ Gyors Vacsorák (<30p)* \| *📦 Raktár-mentő* |
| **Shopping List Screen** | *Bolti Bevásárlólista* \| *Offline is működik a telefonodon a boltban* \| *📋 Másolás* \| *🧹 Pipáltak törlése* |
| **Phase 2 Login Screen** | *Belépés a Konyhába* \| *Email cím* \| *Jelszó* \| *Belépés* |

---

## 6. Project Structure & Docker Blueprint (Phase 1 MVP)

### 6.1. Repository Directory Layout
```text
recipe-organizer/
├── docker-compose.yml
├── db/
│   └── init.sql                     # Tables (recipes, pantry_items, shopping_list), RLS, and seed data
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.ts               # Includes PWA config & local /api/scrape dev proxy
    ├── tailwind.config.js           # Nordic Cozy theme tokens
    ├── .env.example                 # VITE_APP_MODE, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
    ├── functions/
    │   └── api/
    │       └── scrape.ts            # Cloudflare Pages Function for Phase 2 URL scraping
    └── src/
        ├── lib/
        │   ├── dbClient.ts          # Unified Supabase / PostgREST client adapter
        │   └── offlineStore.ts      # localStorage cache & sync queue for shopping_list & pantry_items
        ├── utils/
        │   └── recipeScraper.ts     # Schema.org JSON-LD HTML parser
        ├── components/
        │   ├── Navbar.tsx
        │   ├── RecipeCard.tsx
        │   ├── RecipeDetailModal.tsx
        │   ├── NewRecipeModal.tsx   # Includes free-text + autocomplete "added_by" selector
        │   ├── PantryView.tsx       # "Raktár" inventory & expiration tracker
        │   ├── RecommenderView.tsx
        │   ├── ShoppingListView.tsx
        │   └── LoginModal.tsx       # Simple single-account Supabase login (Phase 2 only)
        └── App.tsx
```

### 6.2. `docker-compose.yml` (Phase 1 Local MVP)
```yaml
version: '3.8'

services:
  postgres-db:
    image: postgres:16-alpine
    container_name: recipe_postgres
    environment:
      POSTGRES_DB: recipedb
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: localdevpassword
    ports:
      - "5432:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data
      - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d recipedb"]
      interval: 5s
      timeout: 5s
      retries: 5

  postgrest-api:
    image: postgrest/postgrest:v12.2.0
    container_name: recipe_postgrest
    ports:
      - "3000:3000"
    environment:
      PGRST_DB_URI: postgres://postgres:localdevpassword@postgres-db:5432/recipedb
      PGRST_DB_SCHEMAS: public
      PGRST_DB_ANON_ROLE: postgres
    depends_on:
      postgres-db:
        condition: service_healthy

  react-frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: recipe_frontend
    ports:
      - "5173:5173"
    volumes:
      - ./frontend/src:/app/src
    environment:
      - VITE_APP_MODE=local
      - VITE_SUPABASE_URL=http://localhost:3000
      - VITE_SUPABASE_ANON_KEY=local-dev-anon-key
    depends_on:
      - postgrest-api

volumes:
  pg_data:
```

---

## 7. Phase 2 Migration Guide (Cloud Deployment)

Once local testing and schema adjustments in Phase 1 are complete:

1. **Create Supabase Project (Free Tier):**
   * Open the **SQL Editor** in Supabase and run `db/init.sql` (with RLS policies enabled).
   * In *Authentication → Providers*, enable **Email**, disable *"Allow new users to sign up"*, and manually create your single shared household user in *Authentication → Users*.
2. **Deploy Frontend to Cloudflare Pages (Free Tier):**
   * Connect the Git repository (root directory: `frontend`, build command: `npm run build`, output directory: `dist`).
   * Add environment variables in Cloudflare Pages settings:
     * `VITE_APP_MODE=supabase`
     * `VITE_SUPABASE_URL=<your-project-url>.supabase.co`
     * `VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>`
   * Cloudflare automatically deploys `functions/api/scrape.ts` to handle external recipe URL imports without CORS issues.