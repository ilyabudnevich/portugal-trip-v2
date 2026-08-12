-- (a) R1/R3 storage — additive nullable columns on itinerary_events.
-- Run in the Supabase SQL editor. v1 selects this table by explicit column
-- list ('id, date, sort_order, text, status, options') and never inserts with
-- defaults it doesn't name, so these columns are structurally invisible to it.
-- The options jsonb stays an array of strings forever; nothing writes objects
-- into it.

alter table public.itinerary_events
  add column if not exists chosen_option text,
  add column if not exists options_meta jsonb,
  add column if not exists maps_q text;

-- chosen_option  exact option string that won ("Event — Winner" render);
--                null = no choice recorded. Orphan rule (app-side): a value
--                matching no current option renders as confirmed-without-choice.
-- options_meta   object keyed by exact option string ->
--                {"meta": "...", "maps_q": "..."}; missing key renders nothing.
-- maps_q         event-level Google Maps query.
