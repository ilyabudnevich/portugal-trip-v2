// Reads trip data from Supabase and reshapes the flat rows into the exact
// shapes the components consume: itinerary days with a nested `events` array,
// packing/prep groups with a nested `items` array.
//
// Every write lives here, so components never touch the Supabase client. The
// write surface is one function per action: flip an event's status, flip an
// item's checked, add an event/item, delete an event/item. Nothing else is ever
// written — flights, hotels, itinerary days, and options lists are read-only.

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
function requireOneRow(table, data, label) {
  if (!data || data.length === 0) {
    throw new Error(`${table} — no row matched ${label}`)
  }
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

function toEvent(row) {
  return {
    id: row.id,
    sort_order: row.sort_order,
    text: row.text,
    status: row.status,
    options: row.options,
  }
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
    // `id` is needed to update or delete a single event; `status` now drives the
    // badge directly instead of being inferred from options-presence.
    supabase
      .from('itinerary_events')
      .select('id, date, sort_order, text, status, options')
      .order('date')
      .order('sort_order'),
    supabase.from('packing_groups').select('id, name').order('sort_order'),
    supabase
      .from('packing_items')
      .select('group_id, id, name, checked, sort_order')
      .order('sort_order'),
    supabase.from('prep_groups').select('id, name').order('sort_order'),
    supabase
      .from('prep_items')
      .select('group_id, id, name, checked, sort_order')
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
      events: (eventsByDate.get(day.date) ?? []).map(toEvent),
    })),
    packingGroups: nestItems(packingGroups.data, packingItems.data),
    prepGroups: nestItems(prepGroups.data, prepItems.data),
  }
}

// ─── Itinerary event writes ─────────────────────────────────────────────────
// Events are identified by their database-generated bigint id.

export async function setEventStatus(id, status) {
  if (!supabase) throw new Error(missingEnvMessage)

  const { data, error } = await supabase
    .from('itinerary_events')
    .update({ status })
    .eq('id', id)
    .select()

  if (error) throw new Error(`itinerary_events — ${error.message}`)
  requireOneRow('itinerary_events', data, `id ${id}`)
}

export async function deleteEvent(id) {
  if (!supabase) throw new Error(missingEnvMessage)

  const { data, error } = await supabase
    .from('itinerary_events')
    .delete()
    .eq('id', id)
    .select()

  if (error) throw new Error(`itinerary_events — ${error.message}`)
  requireOneRow('itinerary_events', data, `id ${id}`)
}

// Returns the created row, whose `id` the database assigned — the caller needs
// that real id in UI state so later toggles and deletes can find the row.
export async function addEvent(date, text, sortOrder) {
  if (!supabase) throw new Error(missingEnvMessage)

  const { data, error } = await supabase
    .from('itinerary_events')
    .insert({
      date,
      sort_order: sortOrder,
      text,
      status: 'confirmed',
      options: null,
    })
    .select()

  if (error) throw new Error(`itinerary_events — ${error.message}`)
  requireOneRow('itinerary_events', data, `new event on ${date}`)
  return toEvent(data[0])
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

async function setItemChecked(table, groupId, itemId, checked) {
  if (!supabase) throw new Error(missingEnvMessage)

  const { data, error } = await supabase
    .from(table)
    .update({ checked })
    .eq('group_id', groupId)
    .eq('id', itemId)
    .select()

  if (error) throw new Error(`${table} — ${error.message}`)
  requireOneRow(table, data, `${groupId}/${itemId}`)
}

async function deleteItem(table, groupId, itemId) {
  if (!supabase) throw new Error(missingEnvMessage)

  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq('group_id', groupId)
    .eq('id', itemId)
    .select()

  if (error) throw new Error(`${table} — ${error.message}`)
  requireOneRow(table, data, `${groupId}/${itemId}`)
}

async function addItem(table, groupId, name, sortOrder) {
  if (!supabase) throw new Error(missingEnvMessage)

  const { data, error } = await supabase
    .from(table)
    .insert({
      group_id: groupId,
      id: newItemId(name),
      sort_order: sortOrder,
      name,
      checked: false,
    })
    .select()

  if (error) throw new Error(`${table} — ${error.message}`)
  requireOneRow(table, data, `new item in ${groupId}`)
  return toItem(data[0])
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
