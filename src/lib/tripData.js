// Reads trip data from Supabase and reshapes the flat rows into the exact
// shapes the components consume: itinerary days with a nested `events` array,
// packing/prep groups with a nested `items` array.
//
// Every write lives here, so components never touch the Supabase client. The
// write surface is one function per action: flip an event's status, flip an
// item's checked, add an event/item, delete an event/item, remove one option
// from an event. Flights, hotels, and itinerary days are read-only.
//
// Every write is bounded by an 8s timeout — see runWrite.

import { missingEnvMessage, supabase } from './supabase.js'

// Buckets child rows by their parent key. The queries already sort by
// sort_order, so arrival order is display order and we just preserve it.
function groupBy(rows, key) {
  const byKey = new Map()
  rows.forEach((row) => {
    const bucket = byKey.get(row[key])
    if (bucket) bucket.push(row)
    else byKey.set(row[key], [row])
  })
  return byKey
}

// A filter that matches nothing is not an error in Postgres, so an update or
// delete that hit no row would otherwise look like success and leave the UI
// showing a change the database never took. Every write ends in .select() so
// the affected rows are visible to this guard.
//
// In practice the cause is almost always the other phone: two people edit the
// same trip, and one deletes a row the other still has on screen. Hence the
// user-facing wording rather than the table/key detail.
function requireOneRow(data) {
  if (!data || data.length === 0) {
    throw new Error('This item was removed on another device.')
  }
}

// fetch() has no default timeout, so a stalled request never settles: the
// optimistic UI keeps the change, no error fires, and nothing reaches the
// database. Aborting turns that silence into a rejection the callers' existing
// revert-and-report paths already handle.
//
// The read gets a longer leash than a write: it is nine parallel queries, and
// on poor hotel wifi the slowest one gates the whole page.
const WRITE_TIMEOUT_MS = 8000
const READ_TIMEOUT_MS = 12000

// Note both timers are throttled to ~1s resolution while the tab is
// backgrounded, so these bounds hold in the foreground — which is where they
// matter.
function timeoutError(ms) {
  return new Error(`Timed out after ${ms / 1000}s — check your connection.`)
}

// Refetch-vs-write coordination.
//
// A refetch that starts before a write lands and resolves after it carries a
// stale snapshot. Applying it resurrects the row a delete just removed, or
// reverts the optimistic flip a toggle just confirmed.
//
// Callers snapshot writeActivity() before fetching and hand it to
// writeOverlapped() afterwards. The counting lives here rather than in the
// components so that every write is covered automatically — there is no call
// site left to forget.
let writeEpoch = 0
let writesInFlight = 0

export function writeActivity() {
  return {
    epoch: writeEpoch,
    inFlight: writesInFlight,
    pending: pendingUndo !== null && pendingUndo.kind === 'delete',
  }
}

export function writeOverlapped(before) {
  return (
    // a write settled while the fetch was in flight
    writeEpoch !== before.epoch ||
    // a write is still in flight now, so its result lands after this snapshot
    writesInFlight > 0 ||
    // a write was already in flight when the fetch started
    before.inFlight > 0 ||
    // a staged delete is (or was) awaiting its undo window: the database still
    // holds the row the screen no longer shows, so any snapshot from this span
    // would resurrect it
    (pendingUndo !== null && pendingUndo.kind === 'delete') ||
    before.pending
  )
}

// ─── Pending-undo manager ───────────────────────────────────────────────────
//
// One slot holding the most recent undoable act, in one of two kinds:
//
// 'delete' — nothing has been sent. The caller removes the row from its own
// state, stages the delete here, and the write fires only when the window
// closes. Undo cancels a write that never happened, so a crash or a closed tab
// errs on the side of keeping data — the row simply reappears on the next
// load.
//
// 'action' — the write has already been committed (a choose is non-destructive
// and commits immediately). The offer is just a standing invitation to run a
// compensating write; when the window expires there is nothing to do but
// withdraw it.
//
// One slot, deliberately. A new stage or offer supersedes whatever holds it —
// a delete commits now, an action clears silently — so "the last thing done"
// is always the thing Undo undoes, and the toast never has to enumerate.
//
// Delete commits are serialised on a promise chain, and every other write
// waits for that chain (see runWrite): a staged delete always lands before any
// later write. That ordering is not politeness — a reorder renumbers a day to
// 1..n computed from state that excludes the staged row, and unique
// (date, sort_order) means landing on the staged row's slot while its delete
// is still in flight would collide. Action offers make no such claim, so
// unrelated writes leave them open — there is no pending write to order, and
// closing the offer early would break the promise the toast just made.
const UNDO_WINDOW_MS = 5000

let pendingUndo = null
let commitChain = Promise.resolve()
let inCommit = false
const pendingUndoListeners = new Set()

function pendingUndoSnapshot() {
  return pendingUndo ? { label: pendingUndo.label } : null
}

function notifyPendingUndo() {
  const snapshot = pendingUndoSnapshot()
  pendingUndoListeners.forEach((cb) => cb(snapshot))
}

// The toast renders off this: `cb` fires with { label } while something is
// undoable and null the moment it commits, expires, is undone, or fails.
// Called once immediately so a subscriber never starts stale.
export function subscribePendingUndo(cb) {
  pendingUndoListeners.add(cb)
  cb(pendingUndoSnapshot())
  return () => pendingUndoListeners.delete(cb)
}

// Resolves the slot without undoing: a delete commits, an action offer simply
// lapses. The slot is cleared before a delete's commit runs — the commit's own
// runWrite must see an empty slot, or it would try to flush itself.
// A failed commit restores the caller's state and reports through its onError;
// the row was never deleted, so restoring is honest.
function flushPendingUndo() {
  if (pendingUndo !== null) {
    const staged = pendingUndo
    pendingUndo = null
    clearTimeout(staged.timer)
    notifyPendingUndo()
    if (staged.kind === 'delete') {
      commitChain = commitChain.then(async () => {
        inCommit = true
        try {
          await staged.commit()
        } catch (err) {
          staged.restore()
          staged.onError(err.message)
        } finally {
          inCommit = false
        }
      })
    }
  }
  return commitChain
}

// What runWrite calls. Identical to flushPendingUndo except that an action
// offer is left standing: only a staged delete has a write whose ordering
// matters.
function flushStagedDelete() {
  if (pendingUndo !== null && pendingUndo.kind === 'delete') {
    return flushPendingUndo()
  }
  return commitChain
}

// The caller has already removed the row from what it renders and keeps enough
// in `restore` to put it back — content, position, everything — without a
// write. `commit` is the ordinary delete write, deferred.
export function stageDelete({ label, commit, restore, onError }) {
  flushPendingUndo() // a second act supersedes: a delete commits, an offer lapses
  const staged = { kind: 'delete', label, commit, restore, onError }
  staged.timer = setTimeout(flushPendingUndo, UNDO_WINDOW_MS)
  pendingUndo = staged
  notifyPendingUndo()
}

// For acts that already committed (choose): `undo` is an async compensating
// write, fully responsible for its own local-state handling; a rejection is
// reported through onError.
export function offerUndo({ label, undo, onError }) {
  flushPendingUndo()
  const staged = { kind: 'action', label, undo, onError }
  staged.timer = setTimeout(flushPendingUndo, UNDO_WINDOW_MS)
  pendingUndo = staged
  notifyPendingUndo()
}

// Undo. For a delete no write is ever sent — the delete simply never happens.
// For an action the compensating write runs here.
export async function undoPending() {
  if (pendingUndo === null) return
  const staged = pendingUndo
  pendingUndo = null
  clearTimeout(staged.timer)
  notifyPendingUndo()
  if (staged.kind === 'delete') {
    staged.restore()
    return
  }
  try {
    await staged.undo()
  } catch (err) {
    staged.onError(err.message)
  }
}

async function runWrite(table, buildQuery) {
  if (!supabase) throw new Error(missingEnvMessage)

  // Any staged delete lands first (see the manager above). inCommit exempts the
  // staged delete's own write from waiting on the chain it is part of, and
  // action offers are left standing — they have no pending write to order.
  // Navigation never triggers this — only writes do — so moving around the app
  // leaves the undo window open.
  if (!inCommit) await flushStagedDelete()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WRITE_TIMEOUT_MS)
  writesInFlight += 1

  let result
  try {
    result = await buildQuery().abortSignal(controller.signal)
  } catch (err) {
    if (controller.signal.aborted) throw timeoutError(WRITE_TIMEOUT_MS)
    throw err
  } finally {
    clearTimeout(timer)
    writesInFlight -= 1
    writeEpoch += 1
  }

  if (controller.signal.aborted) throw timeoutError(WRITE_TIMEOUT_MS)
  if (result.error) throw new Error(`${table} — ${result.error.message}`)
  requireOneRow(result.data)
  return result.data
}

// groups + items -> [{ id, name, items: [{ id, name, checked, sort_order }] }]
// `items` defaults to [] so the components' "Nothing added yet" branch still
// works for a group with no rows.
function nestItems(groups, items) {
  const itemsByGroup = groupBy(items, 'group_id')
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    items: (itemsByGroup.get(group.id) ?? []).map(toItem),
  }))
}

function toItem(row) {
  return {
    id: row.id,
    name: row.name,
    checked: row.checked,
    sort_order: row.sort_order,
  }
}

// memories rows -> { 'YYYY-MM-DD': { day_date, quote_older, quote_younger } }
function toMemoryMap(rows) {
  return Object.fromEntries(rows.map((row) => [row.day_date, row]))
}

function toEvent(row) {
  return {
    id: row.id,
    sort_order: row.sort_order,
    text: row.text,
    status: row.status,
    options: row.options,
    chosen_option: row.chosen_option,
    options_meta: row.options_meta,
    maps_q: row.maps_q,
  }
}

export async function fetchTripData() {
  if (!supabase) throw new Error(missingEnvMessage)

  // One controller for all nine queries: if the load stalls, the whole page is
  // stuck behind it, so they succeed or fail together. A rejection here lands on
  // App's error + Try again path.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS)
  const signal = controller.signal

  let responses
  try {
    responses = await Promise.all([
      // flights and hotels are passed through row-for-row, so select
      // everything. Their camelCase columns ("checkIn", "from", "to") come back
      // as row.checkIn / row.from / row.to — already the names the JSX reads.
      supabase.from('flights').select('*').order('sort_order').abortSignal(signal),
      supabase.from('hotels').select('*').order('sort_order').abortSignal(signal),
      // `title` is nullable and additive: v1 selects this table by an explicit
      // column list that does not name it, so the column cannot reach v1's
      // result set, and v1 never inserts an itinerary row. Null means "no name
      // given" and the UI falls back to the city.
      supabase
        .from('itinerary')
        .select('date, weekday, city, title')
        .order('date')
        .abortSignal(signal),
      // `id` is needed to update or delete a single event; `status` now drives
      // the badge directly instead of being inferred from options-presence.
      // chosen_option / options_meta / maps_q are the additive v2 columns;
      // v1's own select never names them, so they stay invisible to it.
      supabase
        .from('itinerary_events')
        .select(
          'id, date, sort_order, text, status, options, chosen_option, options_meta, maps_q',
        )
        .order('date')
        .order('sort_order')
        .abortSignal(signal),
      supabase
        .from('packing_groups')
        .select('id, name')
        .order('sort_order')
        .abortSignal(signal),
      supabase
        .from('packing_items')
        .select('group_id, id, name, checked, sort_order')
        .order('sort_order')
        .abortSignal(signal),
      supabase
        .from('prep_groups')
        .select('id, name')
        .order('sort_order')
        .abortSignal(signal),
      supabase
        .from('prep_items')
        .select('group_id, id, name, checked, sort_order')
        .order('sort_order')
        .abortSignal(signal),
      supabase
        .from('memories')
        .select('day_date, quote_older, quote_younger')
        .abortSignal(signal),
    ])
  } catch (err) {
    if (signal.aborted) throw timeoutError(READ_TIMEOUT_MS)
    throw err
  } finally {
    clearTimeout(timer)
  }

  if (signal.aborted) throw timeoutError(READ_TIMEOUT_MS)

  const [
    flights,
    hotels,
    days,
    events,
    packingGroups,
    packingItems,
    prepGroups,
    prepItems,
    memories,
  ] = responses

  const results = [
    ['flights', flights],
    ['hotels', hotels],
    ['itinerary', days],
    ['itinerary_events', events],
    ['packing_groups', packingGroups],
    ['packing_items', packingItems],
    ['prep_groups', prepGroups],
    ['prep_items', prepItems],
    ['memories', memories],
  ]

  for (const [table, result] of results) {
    if (result.error) throw new Error(`${table} — ${result.error.message}`)
  }

  const eventsByDate = groupBy(events.data, 'date')

  return {
    flights: flights.data,
    hotels: hotels.data,
    itinerary: days.data.map((day) => ({
      date: day.date,
      weekday: day.weekday,
      city: day.city,
      title: day.title,
      events: (eventsByDate.get(day.date) ?? []).map(toEvent),
    })),
    packingGroups: nestItems(packingGroups.data, packingItems.data),
    prepGroups: nestItems(prepGroups.data, prepItems.data),
    memories: toMemoryMap(memories.data),
  }
}

// ─── Memories ───────────────────────────────────────────────────────────────
// One row per trip day, keyed by date; capture overwrites via upsert. The
// standalone read exists for the port — the app itself gets memories through
// fetchTripData's parallel load.

export async function getMemories(signal) {
  if (!supabase) throw new Error(missingEnvMessage)

  let query = supabase
    .from('memories')
    .select('day_date, quote_older, quote_younger')
  if (signal) query = query.abortSignal(signal)

  const result = await query
  if (result.error) throw new Error(`memories — ${result.error.message}`)
  return toMemoryMap(result.data)
}

// The clear verb: removes the day's row outright, returning the day to
// "not captured". runWrite gives it the same timeout and requireOneRow guard
// as every other write — a row already gone (cleared on the other phone)
// surfaces as "removed on another device" rather than as silent success.
export function deleteMemory(dayDate) {
  return runWrite('memories', () =>
    supabase.from('memories').delete().eq('day_date', dayDate).select(),
  )
}

// Empty quotes store as null, so "she said nothing tonight" and "not captured
// yet" stay distinguishable by the row's existence alone.
export async function saveMemory(dayDate, quoteOlder, quoteYounger) {
  const rows = await runWrite('memories', () =>
    supabase
      .from('memories')
      .upsert({
        day_date: dayDate,
        quote_older: quoteOlder || null,
        quote_younger: quoteYounger || null,
      })
      .select(),
  )
  return rows[0]
}

// ─── Itinerary day writes ───────────────────────────────────────────────────
// The only write this app makes to the `itinerary` table, and it touches one
// column: `title`. date, weekday and city — the three columns v1 reads — are
// never in the update payload, so no value v1 depends on can be altered from
// here even by a bug.
//
// null clears the name rather than storing an empty string, so "no title" has a
// single representation and the city fallback has a single condition.
export async function setDayTitle(date, title) {
  await runWrite('itinerary', () =>
    supabase.from('itinerary').update({ title }).eq('date', date).select(),
  )

  return title
}

// ─── Trip timezone ──────────────────────────────────────────────────────────
//
// Today's date where the trip is, as YYYY-MM-DD. Intl does the timezone math —
// no manual offsets, no DST bookkeeping. en-CA is the locale whose date format
// is already ISO. This is deliberately the only piece of the deferred
// time-awareness bundle that ships: the weather window and the memories
// capture gate both key off it.
export function todayInTripTZ() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
  }).format(new Date())
}

// ─── Weather (Open-Meteo, keyless) ──────────────────────────────────────────
//
// One fetch per city per session, cached in memory — including failures, which
// cache as null so a dead network is one failed request, not one per render.
// The consumer renders nothing on null: no error state, no spinner, no retry.
// Coordinates are the two places the trip actually sleeps; a day whose city
// has no entry here (In transit) simply gets no weather line.
const CITY_COORDS = {
  Lisbon: { lat: 38.72, lon: -9.14 },
  Algarve: { lat: 37.09, lon: -8.19 },
}
const WEATHER_TIMEOUT_MS = 6000
const forecastCache = new Map()

async function fetchForecast({ lat, lon }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS)

  let json
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        '&daily=weathercode,temperature_2m_max,windspeed_10m_max' +
        '&forecast_days=16&timezone=Europe%2FLisbon',
      { signal: controller.signal },
    )
    if (!res.ok) throw new Error(`weather — ${res.status}`)
    json = await res.json()
  } finally {
    clearTimeout(timer)
  }

  // Reshaped to date-keyed rows so the consumer's question — "what about this
  // day?" — is a lookup, not a scan. The 16-day span from today is also the
  // rendering window: a date outside it simply is not a key. The API pads the
  // far end of the window with null values rather than omitting the dates, so
  // those days are dropped here — a half-known forecast renders as no forecast.
  const out = {}
  json.daily.time.forEach((date, i) => {
    const code = json.daily.weathercode[i]
    const tmax = json.daily.temperature_2m_max[i]
    const wind = json.daily.windspeed_10m_max[i]
    if (code == null || tmax == null || wind == null) return
    out[date] = { code, tmax, wind }
  })
  return out
}

// Resolves to a date-keyed forecast map, or null — never rejects.
export function getCityForecast(city) {
  const coords = CITY_COORDS[city]
  if (!coords) return Promise.resolve(null)
  if (!forecastCache.has(city)) {
    forecastCache.set(
      city,
      fetchForecast(coords).catch(() => null),
    )
  }
  return forecastCache.get(city)
}

// Plain Google Maps search URL — no key, no SDK. Lives here so the iOS port
// carries the exact same link-building rule.
// Dormant by scope cut (Aug 12) — never seeded in this scope;
// missing-key-renders-nothing keeps these paths invisible. See
// docs/v2-build-scope-r1-r4.md amendment.
export function mapsUrl(query) {
  return (
    'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent(query)
  )
}

// ─── Itinerary event writes ─────────────────────────────────────────────────
// Events are identified by their database-generated bigint id.

export function setEventStatus(id, status) {
  return runWrite('itinerary_events', () =>
    supabase.from('itinerary_events').update({ status }).eq('id', id).select(),
  )
}

// One decision, one write: status and the winner move together so no failure
// can strand a chosen_option on an open event. chooseOption and reopenEvent
// are the two verbs; the general form also serves choose's compensating undo,
// which must restore whatever pair was there before.
export function setEventDecision(id, status, chosenOption) {
  return runWrite('itinerary_events', () =>
    supabase
      .from('itinerary_events')
      .update({ status, chosen_option: chosenOption })
      .eq('id', id)
      .select(),
  )
}

export function chooseOption(id, option) {
  return setEventDecision(id, 'confirmed', option)
}

export function reopenEvent(id) {
  return setEventDecision(id, 'open', null)
}

export function deleteEvent(id) {
  return runWrite('itinerary_events', () =>
    supabase.from('itinerary_events').delete().eq('id', id).select(),
  )
}

// Returns the created row, whose `id` the database assigned — the caller needs
// that real id in UI state so later toggles and deletes can find the row.
//
// New events arrive 'open'. Something just typed into a day is a thought, not a
// decision — it is homework until she says otherwise, and arriving amber is what
// makes it findable later. (It was 'confirmed' before, which meant every new
// entry was born already settled and silently invisible.) The value is one of
// the two the status column already holds, so nothing about the shared schema
// changes.
export async function addEvent(date, text, sortOrder) {
  const rows = await runWrite('itinerary_events', () =>
    supabase
      .from('itinerary_events')
      .insert({
        date,
        sort_order: sortOrder,
        text,
        status: 'open',
        options: null,
      })
      .select(),
  )
  return toEvent(rows[0])
}

// Removes one option from an event's candidate list. `status` is deliberately
// untouched: an event stays confirmed (or open) regardless of how many
// candidates remain. An emptied array is stored as null, matching how events
// with no candidates were seeded.
//
// This is a read-modify-write on the jsonb array using the options the caller
// already has in state, so it carries the same last-write-wins behaviour as
// every other write here.
// Rewrites one day's sort_order values to match a new order.
//
// unique (date, sort_order) is an immediate constraint and cannot be deferred
// without a schema change, so a straight row-by-row renumber transiently
// collides: the moment one row claims slot 2, the row still holding slot 2
// conflicts. A single upsert is no better — INSERT ... ON CONFLICT DO UPDATE
// resolves row by row, so the same intermediate states reach the index, and it
// would force re-sending text/status and clobber a concurrent edit.
//
// Hence two passes. First park every moving row on a negative slot, which cannot
// collide with any live positive value; then land them all on their final 1..n.
// The parked values ascend in the intended order, so a failure between the passes
// leaves the day still reading correctly — just with negative sort_orders — and
// the caller refetches to show whatever the database actually holds.
//
// `date` is never written. It is added to every filter so this function
// structurally cannot touch a row belonging to another day.
export async function reorderDayEvents(date, ordered) {
  const changed = ordered
    .map((event, index) => ({
      id: event.id,
      from: event.sort_order,
      to: index + 1,
      // -n .. -1 in the new order, so ascending order still reads correctly if
      // the second pass never lands.
      park: -(ordered.length - index),
    }))
    .filter((row) => row.from !== row.to)

  if (changed.length === 0) return []

  const setSortOrder = (id, sortOrder) =>
    runWrite('itinerary_events', () =>
      supabase
        .from('itinerary_events')
        .update({ sort_order: sortOrder })
        .eq('id', id)
        .eq('date', date)
        .select(),
    )

  // Rows left untouched are provably safe to skip: final positions are a
  // permutation of 1..n, so whichever row currently holds a moving row's target
  // slot is itself moving.
  //
  // The passes are sequential; the writes inside each pass run together, because
  // the values within a pass are pairwise distinct.
  await Promise.all(changed.map((row) => setSortOrder(row.id, row.park)))
  await Promise.all(changed.map((row) => setSortOrder(row.id, row.to)))

  return changed.map((row) => row.id)
}

// Rewrites one event's text. Nothing else about the row is touched — not status,
// not options, not sort_order, and not date.
export async function setEventText(id, text) {
  await runWrite('itinerary_events', () =>
    supabase
      .from('itinerary_events')
      .update({ text })
      .eq('id', id)
      .select(),
  )

  return text
}

// Replaces one candidate with another, in place, so the order of the list is
// preserved. Like the other option writes, `status` is deliberately untouched.
//
// Two guards this needs that removeEventOption does not. A duplicate is rejected
// for the same reasons as addEventOption: the rendered list is keyed by the
// option string, and removeEventOption filters by equality. And an option that is
// no longer in the array is rejected rather than appended — a filter can safely
// no-op on a missing value, but a rename has no position to write into.
// `chosenOption` is the event's current chosen_option (or null): renaming the
// option it points at must move the pointer in the same write, or the choice
// would silently orphan and the "— Winner" render fall back.
export async function renameEventOption(
  id,
  currentOptions,
  option,
  nextOption,
  chosenOption = null,
) {
  const existing = currentOptions ?? []
  const index = existing.indexOf(option)

  if (index < 0) {
    throw new Error('That option was changed on another device.')
  }
  if (existing.includes(nextOption)) {
    throw new Error(`'${nextOption}' is already an option.`)
  }

  const value = existing.map((entry, i) => (i === index ? nextOption : entry))
  const payload = { options: value }
  if (chosenOption === option) payload.chosen_option = nextOption

  await runWrite('itinerary_events', () =>
    supabase
      .from('itinerary_events')
      .update(payload)
      .eq('id', id)
      .select(),
  )

  return value
}

// Appends one candidate to an event's options array. Like removeEventOption,
// `status` is deliberately untouched: gaining or losing candidates says nothing
// about whether the decision is settled.
//
// Duplicates are rejected rather than silently dropped. The rendered list is
// keyed by the option string, so a duplicate would collide, and
// removeEventOption filters by equality — deleting one copy would remove both.
export async function addEventOption(id, currentOptions, option) {
  const existing = currentOptions ?? []
  if (existing.includes(option)) {
    throw new Error(`'${option}' is already an option.`)
  }

  const value = [...existing, option]

  await runWrite('itinerary_events', () =>
    supabase
      .from('itinerary_events')
      .update({ options: value })
      .eq('id', id)
      .select(),
  )

  return value
}

// The staged-delete counterpart to removeEventOption. An undo window is seconds
// long where the immediate path's exposure was milliseconds, so the options
// array is re-read at commit time rather than trusted from stage time: an
// option the other phone added or renamed during the window survives the
// removal instead of being overwritten by the stale capture.
//
// An option already gone from the fresh array commits as a no-op; a row deleted
// remotely surfaces as requireOneRow's "removed on another device", which lands
// on the staged delete's restore-and-report path.
export async function commitOptionRemoval(id, option) {
  if (!supabase) throw new Error(missingEnvMessage)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WRITE_TIMEOUT_MS)

  let result
  try {
    result = await supabase
      .from('itinerary_events')
      .select('options, chosen_option')
      .eq('id', id)
      .abortSignal(controller.signal)
  } catch (err) {
    if (controller.signal.aborted) throw timeoutError(WRITE_TIMEOUT_MS)
    throw err
  } finally {
    clearTimeout(timer)
  }

  if (controller.signal.aborted) throw timeoutError(WRITE_TIMEOUT_MS)
  if (result.error) {
    throw new Error(`itinerary_events — ${result.error.message}`)
  }
  requireOneRow(result.data)

  const fresh = result.data[0].options ?? []
  if (!fresh.includes(option)) return fresh.length > 0 ? fresh : null

  return removeEventOption(id, fresh, option, result.data[0].chosen_option)
}

// Deleting the chosen option clears the choice in the same write — the pinned
// sync rule. `chosenOption` is the row's current chosen_option (or null).
export async function removeEventOption(id, options, option, chosenOption = null) {
  const next = (options ?? []).filter((o) => o !== option)
  const value = next.length > 0 ? next : null
  const payload = { options: value }
  if (chosenOption === option) payload.chosen_option = null

  await runWrite('itinerary_events', () =>
    supabase
      .from('itinerary_events')
      .update(payload)
      .eq('id', id)
      .select(),
  )

  return value
}

// ─── Packing / prep item writes ─────────────────────────────────────────────
// Items are identified by their composite primary key (group_id, id) — item ids
// are only unique within a group, so both halves are always required.

// Item ids are text and never displayed; they only need to be unique within the
// group. A readable slug plus a short random suffix keeps them recognisable in
// the table editor without risking a collision with an existing row.
function newItemId(name) {
  const slug = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // so "Óbidos" slugs to "obidos"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${slug || 'item'}-${suffix}`
}

function setItemChecked(table, groupId, itemId, checked) {
  return runWrite(table, () =>
    supabase
      .from(table)
      .update({ checked })
      .eq('group_id', groupId)
      .eq('id', itemId)
      .select(),
  )
}

function deleteItem(table, groupId, itemId) {
  return runWrite(table, () =>
    supabase
      .from(table)
      .delete()
      .eq('group_id', groupId)
      .eq('id', itemId)
      .select(),
  )
}

// Rewrites one item's name. group_id, id, sort_order and checked are untouched —
// the id is an internal slug and is deliberately not regenerated from the new
// name, since checkbox history and every existing reference key off it.
function setItemName(table, groupId, itemId, name) {
  return runWrite(table, () =>
    supabase
      .from(table)
      .update({ name })
      .eq('group_id', groupId)
      .eq('id', itemId)
      .select(),
  )
}

// Rewrites one group's sort_order values to match a new order.
//
// A single pass, unlike reorderDayEvents. That function needs a temporary
// parking pass because itinerary_events carries unique (date, sort_order), so a
// row-by-row renumber transiently collides. packing_items and prep_items have no
// uniqueness rule on sort_order — their primary key is (group_id, id) — so there
// is no index for an intermediate state to violate, and parking would only
// double the round-trips.
//
// `group_id` is never written. It scopes every filter, so this cannot move an
// item between groups even if the caller passes the wrong list.
async function reorderGroupItems(table, groupId, ordered) {
  const changed = ordered
    .map((item, index) => ({ id: item.id, from: item.sort_order, to: index + 1 }))
    .filter((row) => row.from !== row.to)

  if (changed.length === 0) return []

  await Promise.all(
    changed.map((row) =>
      runWrite(table, () =>
        supabase
          .from(table)
          .update({ sort_order: row.to })
          .eq('group_id', groupId)
          .eq('id', row.id)
          .select(),
      ),
    ),
  )

  return changed.map((row) => row.id)
}

async function addItem(table, groupId, name, sortOrder) {
  const rows = await runWrite(table, () =>
    supabase
      .from(table)
      .insert({
        group_id: groupId,
        id: newItemId(name),
        sort_order: sortOrder,
        name,
        checked: false,
      })
      .select(),
  )
  return toItem(rows[0])
}

export function setPackingItemChecked(groupId, itemId, checked) {
  return setItemChecked('packing_items', groupId, itemId, checked)
}

export function setPrepItemChecked(groupId, itemId, checked) {
  return setItemChecked('prep_items', groupId, itemId, checked)
}

export function deletePackingItem(groupId, itemId) {
  return deleteItem('packing_items', groupId, itemId)
}

export function deletePrepItem(groupId, itemId) {
  return deleteItem('prep_items', groupId, itemId)
}

export function addPackingItem(groupId, name, sortOrder) {
  return addItem('packing_items', groupId, name, sortOrder)
}

export function addPrepItem(groupId, name, sortOrder) {
  return addItem('prep_items', groupId, name, sortOrder)
}

export async function setPackingItemName(groupId, itemId, name) {
  await setItemName('packing_items', groupId, itemId, name)
  return name
}

export async function setPrepItemName(groupId, itemId, name) {
  await setItemName('prep_items', groupId, itemId, name)
  return name
}

export function reorderPackingItems(groupId, ordered) {
  return reorderGroupItems('packing_items', groupId, ordered)
}

export function reorderPrepItems(groupId, ordered) {
  return reorderGroupItems('prep_items', groupId, ordered)
}
