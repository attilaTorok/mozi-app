-- Recipe Organizer – schema + seed data.
-- Phase 1: mounted into postgres:16-alpine (docker-entrypoint-initdb.d).
-- Phase 2: paste into the Supabase SQL Editor (and enable the RLS block at the bottom).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS recipes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  added_by          TEXT,
  source_url        TEXT,
  prep_time_minutes INTEGER NOT NULL DEFAULT 30,
  base_servings     INTEGER NOT NULL DEFAULT 4,
  cost_tier         TEXT NOT NULL DEFAULT 'MODERATE' CHECK (cost_tier IN ('CHEAP', 'MODERATE', 'EXPENSIVE')),
  rating            INTEGER CHECK (rating >= 1 AND rating <= 5),
  tags              JSONB NOT NULL DEFAULT '[]'::jsonb,
  ingredients       JSONB NOT NULL DEFAULT '[]'::jsonb,
  instructions      TEXT NOT NULL DEFAULT '',
  times_cooked      INTEGER NOT NULL DEFAULT 0,
  last_cooked_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pantry_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name   TEXT NOT NULL,
  amount      NUMERIC(8, 2) NOT NULL DEFAULT 1,
  unit        TEXT NOT NULL DEFAULT 'db',
  expires_at  DATE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shopping_list (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name    TEXT NOT NULL,
  amount       NUMERIC(8, 2),
  unit         TEXT,
  recipe_name  TEXT DEFAULT 'Kézi tétel',
  is_checked   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------ seed data
INSERT INTO recipes (title, added_by, prep_time_minutes, base_servings, cost_tier, rating, tags, ingredients, instructions, times_cooked, last_cooked_at) VALUES
(
  'Chilis-Lime-os Csirkemell', 'Attila', 25, 4, 'MODERATE', 5,
  '["gyors", "mexikói", "csirke"]',
  '[{"name":"Csirkemellfilé","amount":500,"unit":"g"},{"name":"Lime","amount":2,"unit":"db"},{"name":"Chilipehely","amount":1,"unit":"tk"},{"name":"Fokhagyma","amount":3,"unit":"gerezd"},{"name":"Olívaolaj","amount":3,"unit":"ek"}]',
  E'A csirkemellet csíkokra vágjuk, és sózzuk, borsozzuk.\nA lime levét a chilivel, a zúzott fokhagymával és az olajjal összekeverjük, ebben pácoljuk 10 percig.\nForró serpenyőben mindkét oldalán 5-6 percig sütjük.\nLime-szeletekkel és rizzsel tálaljuk.',
  6, now() - interval '5 days'
),
(
  'Sajtos-Tejfölös Tepsis Karaj', 'Bogi', 50, 4, 'CHEAP', 4,
  '["tepsis", "sertés", "családi"]',
  '[{"name":"Sertéskaraj","amount":800,"unit":"g"},{"name":"Tejföl 20%","amount":2,"unit":"dl"},{"name":"Reszelt sajt","amount":150,"unit":"g"},{"name":"Vöröshagyma","amount":2,"unit":"db"},{"name":"Fokhagyma","amount":2,"unit":"gerezd"}]',
  E'A karajszeleteket kiklopfoljuk, sózzuk, borsozzuk, és tepsibe tesszük.\nA hagymát karikákra vágjuk, a húsra rakjuk.\nA tejfölt a zúzott fokhagymával elkeverjük, a hús tetejére kenjük.\nSajttal megszórjuk, és 190 fokon 40 percig sütjük.',
  3, now() - interval '12 days'
),
(
  'Vargányás Tejszínes Tagliatelle', 'Attila', 30, 3, 'EXPENSIVE', 5,
  '["tészta", "vegetáriánus", "ünnepi"]',
  '[{"name":"Tagliatelle","amount":300,"unit":"g"},{"name":"Szárított vargánya","amount":30,"unit":"g"},{"name":"Főzőtejszín","amount":2,"unit":"dl"},{"name":"Vöröshagyma","amount":1,"unit":"db"},{"name":"Parmezán","amount":50,"unit":"g"}]',
  E'A vargányát meleg vízben 20 percig áztatjuk.\nA hagymát vajon megpirítjuk, hozzáadjuk a leszűrt gombát.\nFelöntjük a tejszínnel, és 5 percig főzzük.\nA kifőzött tésztát összeforgatjuk a szósszal, parmezánnal szórjuk meg.',
  4, now() - interval '47 days'
),
(
  'Krémes Vöröslencse Dhal', 'Bogi', 35, 4, 'CHEAP', 4,
  '["vegán", "indiai", "lencse"]',
  '[{"name":"Vöröslencse","amount":300,"unit":"g"},{"name":"Kókusztej","amount":400,"unit":"ml"},{"name":"Vöröshagyma","amount":1,"unit":"db"},{"name":"Fokhagyma","amount":3,"unit":"gerezd"},{"name":"Curry por","amount":2,"unit":"ek"}]',
  E'A hagymát és a fokhagymát olajon megdinszteljük, hozzáadjuk a curryt.\nBeletesszük a megmosott lencsét, felöntjük 6 dl vízzel.\n20 perc főzés után hozzáadjuk a kókusztejet.\nSózzuk, és rizzsel vagy naan kenyérrel tálaljuk.',
  2, now() - interval '20 days'
),
(
  'Gyors Rántotta Paradicsommal', 'Attila', 10, 2, 'CHEAP', 3,
  '["gyors", "reggeli", "tojás"]',
  '[{"name":"Tojás","amount":4,"unit":"db"},{"name":"Paradicsom","amount":2,"unit":"db"},{"name":"Vaj","amount":1,"unit":"ek"}]',
  E'A paradicsomot kockázzuk, vajon megpirítjuk.\nA felvert tojást ráöntjük, és kevergetve megsütjük.',
  0, NULL
);

INSERT INTO pantry_items (item_name, amount, unit, expires_at) VALUES
  ('Cottage cheese', 5,   'db', current_date + 4),
  ('Csirkemellfilé', 800, 'g',  current_date + 2),
  ('Tejföl 20%',     1,   'db', current_date + 9),
  ('Vöröslencse',    500, 'g',  NULL),
  ('Tojás',          6,   'db', current_date + 14),
  ('Tagliatelle',    250, 'g',  NULL);

INSERT INTO shopping_list (item_name, amount, unit, recipe_name) VALUES
  ('Lime', 2, 'db', 'Chilis-Lime-os Csirkemell');

-- ------------------------------------------------------------------ RLS (Phase 2 / Supabase only)
-- Keep commented out for the local PostgREST anonymous dev role.
--
-- ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE pantry_items ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE shopping_list ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "Authenticated household access on recipes" ON recipes
--   FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- CREATE POLICY "Authenticated household access on pantry_items" ON pantry_items
--   FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- CREATE POLICY "Authenticated household access on shopping_list" ON shopping_list
--   FOR ALL TO authenticated USING (true) WITH CHECK (true);

