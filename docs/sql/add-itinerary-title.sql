-- Chunk 4 — day titles. Run in the Supabase SQL editor.
--
-- Additive and nullable, per the shared-database contract: v1 selects this
-- table as `select('date, weekday, city')`, an explicit column list, so this
-- column cannot appear in v1's result set; and v1 never inserts an itinerary
-- row, so it can never be asked for a value. No rename, no drop, no type
-- change, no new required field.

-- Step 1 — the column. This is the whole schema change.
alter table public.itinerary
  add column if not exists title text;


-- Step 2 — ONLY IF naming a day fails in the app with a "removed on another
-- device" or permissions error.
--
-- Until now nothing wrote to `itinerary` — v1 and v2 both treated it as
-- read-only — so if row-level security is on, the table may have a select
-- policy and no update policy. An update that matches no row is not an error in
-- Postgres; the app's requireOneRow guard turns that silence into that message.
--
-- First look at what exists, on this table and on the events table that is
-- already writable:
--
--   select tablename, policyname, cmd, roles, qual, with_check
--     from pg_policies
--    where tablename in ('itinerary', 'itinerary_events');
--
-- Then mirror itinerary_events' update policy onto itinerary, e.g.:
--
--   create policy "itinerary title is updatable"
--     on public.itinerary for update
--     to anon
--     using (true)
--     with check (true);
--
-- Adjust `to anon` to whichever role itinerary_events actually grants.
