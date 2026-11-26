# Kandalló & Konyha – Recipe Organizer & Kitchen Inventory

Backendless architecture (Phase 1: local Docker MVP). Driving spec: [supabase_s_react_rendszerterv.md](supabase_s_react_rendszerterv.md)

There is no custom backend: the React PWA talks straight to PostgREST (the same REST layer Supabase uses).
The app is private to one household, so there are no users, profiles or household/invite tables.

```
.
├── docker-compose.yml
├── db/init.sql        tables (recipes, pantry_items, shopping_list), seed data, RLS (commented out for Phase 1)
└── frontend/          React 19 + TypeScript + Vite + Tailwind v4 PWA (Hungarian UI)
```

## Run (Phase 1)

```bash
docker compose up --build
```

| Service    | URL                    | Notes                                                    |
| :--------- | :--------------------- | :------------------------------------------------------- |
| Frontend   | http://localhost:5173  | Vite dev server (hot reload of `frontend/src`)           |
| PostgREST  | http://localhost:3000  | REST API over PostgreSQL, anonymous dev role             |
| PostgreSQL | localhost:5432         | `recipedb`, user `postgres` / `localdevpassword`         |

* `db/init.sql` runs only on the first start of an empty volume. To re-seed: `docker compose down -v`.
* The frontend talks to `<current hostname>:3000` by default, so it also works from a phone on the LAN
  (override with `VITE_SUPABASE_URL`).

## Frontend (`frontend/src`)

* `lib/dbClient.ts` – unified adapter: PostgREST (`VITE_APP_MODE=local`) or Supabase (`VITE_APP_MODE=supabase`).
* `lib/offlineStore.ts` – localStorage cache; `context/ShoppingContext.tsx` adds the pending-change queue
  (works offline in the supermarket, flushes when back online).
* `context/` – recipes, pantry ("Raktár") and shopping list state.
* `utils/recipeScraper.ts` – Schema.org JSON-LD parser (DOMParser); HTML is fetched through `/api/scrape`
  (Vite middleware locally, `functions/api/scrape.ts` Cloudflare Pages Function in Phase 2).
* `pages/` – recipes (search, filters, sorting, dormant banner), detail (servings scaler, pantry cross-reference,
  rating, "Megfőztük ma!"), form (manual + URL import, "Ki adta hozzá?" chips/autocomplete), "Mit főzzek?" (incl. Raktár-mentő),
  pantry with expiry badges and steppers, offline shopping list.
* All copy lives in `src/strings.ts`.

## Phase 2 (Supabase + Cloudflare Pages)

Run `db/init.sql` in the Supabase SQL Editor with the RLS block enabled, create the single shared user,
then set `VITE_APP_MODE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` on Cloudflare Pages
(root `frontend`, build `npm run build`, output `dist`).

## Notes

* `docker-compose.yml` uses the anonymous `postgres` role for PostgREST – local development only.
* Service workers need HTTPS or `localhost`; the PWA is only precached in production builds.
* The old PocketBase spec (`PocketBase és React Rendszerterv.md`) is obsolete.

