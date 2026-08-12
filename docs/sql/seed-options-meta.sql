-- (c) R3 seed — DRAFT · VALUES UNVERIFIED
-- Do not run until you have confirmed hours / closing days / drive times
-- against Google. Values are sourced ONLY from docs (before-after-
-- walkthrough.jsx DINNER_OPTS / AFTERNOON_OPTS); "Tonight" phrasing is
-- rewritten to static truth. Row targets verified against the 2026-08-11
-- snapshot (id + date belt-and-braces).
--
-- OPEN QUESTIONS — the docs carry no context lines for these; listed, not
-- invented (they render without meta until you supply values):
--   · Sep 3 Benagil pair (id 42): "Pine Cliffs catamaran", "Albufeira marina tour"
--   · Sep 3 lunch set (id 43): Carvoeiro / Ferragudo square / Rei das Praias / resort
--   · Aug 31 lunch pair (id 22): "Azenhas do Mar (reserve ahead)", "Alternative near Sintra"
--   · Aug 29 (id 4): DB option reads "tuk tuk" (renamed during testing); the
--     walkthrough's entry is "Tuk-tuk tour — Alfama & miradouros"
--     (maps_q "Praça da Figueira Lisbon"). Not seeded under a mismatched key —
--     say if "tuk tuk" should take that maps_q.

-- Sep 2 Dinner (id 39) — walkthrough DINNER_OPTS, de-"Tonight"-ed.
update public.itinerary_events set options_meta = '{
  "Veneza": {
    "meta": "18:30–22:00 · closed Mon · 12 min drive",
    "maps_q": "Restaurante Veneza Albufeira"
  },
  "O Charneco": {
    "meta": "19:00–22:30 · 18 min drive",
    "maps_q": "O Charneco Estombar"
  },
  "Restaurante Olhos d''Água": {
    "meta": "18:00–23:00 · 9 min drive",
    "maps_q": "Restaurante Olhos d''Água Albufeira"
  }
}'::jsonb
where id = 39 and date = '2026-09-02';

-- Aug 29 late afternoon (id 4) — walkthrough AFTERNOON_OPTS: maps queries
-- only, no meta lines exist in the docs.
update public.itinerary_events set options_meta = '{
  "Praça do Comércio + Rua Augusta wander": {
    "maps_q": "Praça do Comércio Lisbon"
  },
  "Cais do Sodré–Cacilhas ferry": {
    "maps_q": "Cais do Sodré ferry terminal Lisbon"
  }
}'::jsonb
where id = 4 and date = '2026-08-29';
