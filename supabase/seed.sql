-- Local test stack only (applied by `supabase db reset`). Never run against hosted projects.
-- Contains only real reference data taken from the legacy site:
--   categories  → legacy/products.html filter buttons + CAKE_CATS / COOKIE_CATS
--   shipping    → legacy/products.html MH_SHIPPING_SLABS
-- The full product catalog import is Phase 8 (docs/MIGRATION-PLAN.md).

insert into public.product_categories (slug, name, emoji, ships_statewide, sort_order) values
  ('cakes',      'Cakes',        '🎂', false, 10),
  ('pastries',   'Pastries',     '🥐', true,  20),
  ('loaves',     'Loaves',       '🍞', true,  30),
  ('desserts',   'Desserts',     '🍮', true,  40),
  ('jars',       'Jars & Bowls', '🫙', true,  50),
  ('cake-balls', 'Cake Balls',   '🍡', true,  60);

insert into public.shipping_rates (label, max_grams, charge_paise, sort_order) values
  ('Up to 500g', 500,  6000,  10),
  ('Up to 1 kg', 1000, 8000,  20),
  ('Up to 2 kg', 2000, 12000, 30),
  ('Up to 3 kg', 3000, 15000, 40),
  ('Up to 5 kg', 5000, 20000, 50),
  ('Above 5 kg', null, 25000, 60);
