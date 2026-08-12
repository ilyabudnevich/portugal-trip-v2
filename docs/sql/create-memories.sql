-- (b) R4 — the memories table. Run in the Supabase SQL editor.
-- Additive: a new table no deployed app selects from until v2-10 ships.
-- day_date is the primary key — one memory row per trip day, capture
-- overwrites via upsert. Quotes are nullable so a single-quote evening
-- still saves.

create table if not exists public.memories (
  day_date date primary key,
  quote_older text,
  quote_younger text,
  created_at timestamptz default now()
);

-- RLS is deliberately off on this project's tables (single-user tier);
-- no policies needed. If you have RLS globally forced, mirror whatever
-- itinerary_events uses.
