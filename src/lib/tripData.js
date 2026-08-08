// Reads trip data from Supabase and reshapes the flat rows into the exact
// shapes the components already consume: itinerary days with a nested `events`
// array, packing/prep groups with a nested `items` array.
//
// The write surface is deliberately tiny: fetchTripData() reads, and
// setPackingItemChecked / setPrepItemChecked update a single `checked` column on
// a single row. No inserts, no deletes, nothing else is ever written.
// Components go through this module so they never touch the Supabase client.

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

// groups + items -> [{ id, name, items: [{ id, name, checked }] }]
// `items` defaults to [] so the components' existing "Nothing added yet"
// branch still works for a group with no rows.
function nestItems(groups, items) {
  const itemsByGroup = groupBy(items, 'group_id')
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    items: (itemsByGroup.get(group.id) ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      checked: item.checked,
    })),
  }))
}

export async function fetchTripData() {
  if (!supabase) throw new Error(missingEnvMessage)

  const [
    flights,
    hotels,
    days,
    events,
    packingGroups,
    packingItems,
    prepGroups,
    prepItems,
  ] = await Promise.all([
    // flights and hotels are passed through row-for-row, so select everything.
    // Their camelCase columns ("checkIn", "from", "to") come back as
    // row.checkIn / row.from / row.to — already the names the JSX reads.
    supabase.from('flights').select('*').order('sort_order'),
    supabase.from('hotels').select('*').order('sort_order'),
    supabase.from('itinerary').select('date, weekday, city').order('date'),
    // `status` is intentionally not selected: App.jsx derives each event's
    // badge from whether `options` is present, and this slice must not change
    // what renders.
    supabase
      .from('itinerary_events')
      .select('date, text, options')
      .order('date')
      .order('sort_order'),
    supabase.from('packing_groups').select('id, name').order('sort_order'),
    supabase
      .from('packing_items')
      .select('group_id, id, name, checked')
      .order('sort_order'),
    supabase.from('prep_groups').select('id, name').order('sort_order'),
    supabase
      .from('prep_items')
      .select('group_id, id, name, checked')
      .order('sort_order'),
  ])

  const results = [
    ['flights', flights],
    ['hotels', hotels],
    ['itinerary', days],
    ['itinerary_events', events],
    ['packing_groups', packingGroups],
    ['packing_items', packingItems],
    ['prep_groups', prepGroups],
    ['prep_items', prepItems],
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
      events: (eventsByDate.get(day.date) ?? []).map((event) => ({
        text: event.text,
        options: event.options,
      })),
    })),
    packingGroups: nestItems(packingGroups.data, packingItems.data),
    prepGroups: nestItems(prepGroups.data, prepItems.data),
  }
}

// Flips `checked` on exactly one row, found by its composite primary key
// (group_id, id) — item ids are only unique within a group, so both halves are
// required. The trailing .select() returns the rows actually updated: a filter
// that matches nothing is not an error in Postgres, so without this an update
// that hit no row would look like success and the UI would keep a change the
// database never took.
async function setItemChecked(table, groupId, itemId, checked) {
  if (!supabase) throw new Error(missingEnvMessage)

  const { data, error } = await supabase
    .from(table)
    .update({ checked })
    .eq('group_id', groupId)
    .eq('id', itemId)
    .select()

  if (error) throw new Error(`${table} — ${error.message}`)
  if (!data || data.length === 0) {
    throw new Error(`${table} — no row matched ${groupId}/${itemId}`)
  }
}

export function setPackingItemChecked(groupId, itemId, checked) {
  return setItemChecked('packing_items', groupId, itemId, checked)
}

export function setPrepItemChecked(groupId, itemId, checked) {
  return setItemChecked('prep_items', groupId, itemId, checked)
}
