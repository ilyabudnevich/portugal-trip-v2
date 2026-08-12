import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  addEvent,
  addEventOption,
  chooseOption,
  commitOptionRemoval,
  deleteEvent,
  fetchTripData,
  mapsUrl,
  offerUndo,
  renameEventOption,
  reopenEvent,
  reorderDayEvents,
  setDayTitle,
  setEventDecision,
  setEventStatus,
  setEventText,
  stageDelete,
  subscribePendingUndo,
  undoPending,
  writeActivity,
  writeOverlapped,
} from './lib/tripData.js'
import PackingList from './components/PackingList.jsx'
import TripPrep from './components/TripPrep.jsx'
import './App.css'

function formatStatus(status) {
  return status.toUpperCase()
}

// Local date parts, not toISOString() — that returns UTC and would show the
// wrong day for anyone west of Greenwich in the evening.
function localDateKey(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Where to scroll on first load in the All days list. Today when the trip is
// running; otherwise the nearest end of it, so the list always opens on a useful
// day. ISO dates compare correctly as strings.
function pickAnchorDate(itinerary, todayKey) {
  if (itinerary.length === 0) return null
  if (itinerary.some((day) => day.date === todayKey)) return todayKey
  if (todayKey < itinerary[0].date) return itinerary[0].date
  return itinerary[itinerary.length - 1].date
}

// Which day the Day view opens on: today while the trip is running, otherwise
// the first day. A different question from the anchor above — before the trip
// this opens on departure day, and after it, on day one rather than the last.
function pickDefaultDate(itinerary, todayKey) {
  if (itinerary.length === 0) return null
  if (itinerary.some((day) => day.date === todayKey)) return todayKey
  return itinerary[0].date
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

// Splits '2026-08-28' by hand rather than through Date, which would parse it as
// UTC midnight and render the day before for anyone west of Greenwich.
function shortDate(iso) {
  const [, month, day] = iso.split('-')
  return `${MONTHS[Number(month) - 1]} ${Number(day)}`
}

function dayOfMonth(iso) {
  return String(Number(iso.split('-')[2]))
}

// Local midnight, so a difference of whole days is a difference of whole days —
// new Date('2026-08-28') would be UTC midnight and land on the 27th here.
function parseDateKey(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

// Rounded, not floored: the two dates are local midnights, and a DST boundary
// between them makes the span 23 or 25 hours.
function daysBetween(fromKey, toKey) {
  return Math.round(
    (parseDateKey(toKey) - parseDateKey(fromKey)) / 86400000,
  )
}

// The azulejo tile from the brief, as a border for the hero. Decoration only —
// hence aria-hidden on the row rather than a label here.
function Tile() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="tile-glyph">
      <path
        d="M22 4 C26 12, 34 14, 40 14 C34 20, 32 26, 32 34 C26 30, 18 30, 12 34 C14 26, 10 20, 4 14 C12 14, 18 10, 22 4 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="22" cy="22" r="3.2" fill="currentColor" />
      <path
        d="M2 2 h6 M2 2 v6 M42 2 h-6 M42 2 v6 M2 42 h6 M2 42 v-6 M42 42 h-6 M42 42 v-6"
        stroke="currentColor"
        strokeWidth="1.1"
        fill="none"
      />
    </svg>
  )
}

// Enough tiles to cross the widest phone; the row clips whatever does not fit.
function TileRow() {
  return (
    <div className="tile-row" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => (
        <Tile key={i} />
      ))}
    </div>
  )
}

// Counts down to the first itinerary date, then counts through the trip, then
// stops existing. Ticking lives in App (todayKey is state), so this is pure —
// it re-renders when the date rolls over, not on a timer of its own.
function Countdown({ itinerary, todayKey }) {
  if (itinerary.length === 0) return null

  const first = itinerary[0].date
  const last = itinerary[itinerary.length - 1].date

  if (todayKey > last) return null // the trip is over; the number is not news

  if (todayKey >= first) {
    return (
      <p className="countdown">
        <span className="count-num">{daysBetween(first, todayKey) + 1}</span>
        <span className="count-label">of {itinerary.length} days</span>
      </p>
    )
  }

  const days = daysBetween(todayKey, first)
  return (
    <p className="countdown">
      <span className="count-num">{days}</span>
      <span className="count-label">
        {days === 1 ? 'day to wheels-up' : 'days to wheels-up'}
      </span>
    </p>
  )
}

// Legs are derived from the days themselves — nothing is hardcoded, so a city
// added in the database becomes a tab on its own.
//
// A travel day belongs to the leg it is heading into: 'In transit' resolves to
// the next real city (the last day falls back to the previous one), which puts
// the outbound flight under Lisbon instead of stranding it in a leg of one.
// Legs are then contiguous runs, so a return to a city later in the trip would
// correctly read as a second visit rather than merging into the first.
function deriveLegs(itinerary) {
  const cities = itinerary.map((day) => day.city)

  const resolved = cities.map((city, i) => {
    if (city !== 'In transit') return city
    const after = cities.slice(i + 1).find((c) => c !== 'In transit')
    if (after) return after
    const before = cities.slice(0, i).reverse().find((c) => c !== 'In transit')
    return before ?? city
  })

  const legs = []
  resolved.forEach((city, i) => {
    const current = legs[legs.length - 1]
    if (current && current.city === city) current.days.push(itinerary[i])
    else legs.push({ id: `${city}-${itinerary[i].date}`, city, days: [itinerary[i]] })
  })
  return legs
}

// The brief gives every event a time in its own field, in cobalt. The schema has
// no such column and inventing one is out of the question — but the times are
// already in the text she typed ("Oceanário de Lisboa, 10:00"), so they are
// picked out where they actually are rather than moved to a field that does not
// exist. Display only: the stored string is never altered.
//
// The capture group is what puts the matches at the odd indices of the split.
const TIME_TOKEN = /(\d{1,2}:\d{2}(?:\s*[–—-]\s*\d{1,2}:\d{2})?)/g

function withTimes(text) {
  return text
    .split(TIME_TOKEN)
    .map((part, i) =>
      i % 2 === 1 ? (
        <span className="ev-time" key={i}>
          {part}
        </span>
      ) : (
        part
      ),
    )
}

// One event while its day is being arranged: a drag handle, the text, and the
// candidates that travel with it, each with the × that removes it. Deleting is
// gated behind this mode: in browse there is nothing sharp to catch a thumb, and
// the same tap that used to delete an event now does nothing at all.
//
// Status is the one control that stays out. The badge in the normal view is the
// toggle, on every event, so nothing is out of reach and this card has no reason
// to carry a second copy of it.
// One tap-to-edit label. Renders as prose until tapped, then as an input.
// Escape stops propagation so it reverts this edit rather than reaching the
// window handler that exits the whole mode.
function EditableText({ value, label, isEditing, edit, placeholder }) {
  if (isEditing) {
    return (
      <input
        className="add-input"
        autoFocus
        value={edit.draft}
        aria-label={label}
        placeholder={placeholder}
        onChange={(e) => edit.change(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') edit.commit()
          if (e.key === 'Escape') {
            e.stopPropagation()
            edit.cancel()
          }
        }}
        onBlur={() => edit.commit()}
      />
    )
  }

  return (
    <button type="button" className="edit-text" onClick={edit.begin}>
      {value}
    </button>
  )
}

function SortableEventRow({ event, edit, showHandle, onDelete, onRemoveOption }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: event.id })

  const target = edit.target
  const editingEvent =
    target !== null && target.kind === 'event' && target.eventId === event.id

  return (
    <li
      ref={setNodeRef}
      className={`event-row-arranging ${isDragging ? 'is-dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {/* dnd-kit's listeners only ever land on this button, so not rendering it
          is what makes a single-event day undraggable — no separate guard. */}
      {showHandle && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="event-handle"
          aria-label={`Reorder ${event.text}`}
          {...attributes}
          {...listeners}
        >
          ≡
        </button>
      )}
      <div className="arranging-body">
        <EditableText
          value={event.text}
          label={`Rename event: ${event.text}`}
          isEditing={editingEvent}
          edit={{
            draft: edit.draft,
            change: edit.change,
            commit: edit.commit,
            cancel: edit.cancel,
            begin: () => edit.begin({ kind: 'event', eventId: event.id }, event.text),
          }}
        />
        {event.options && event.options.length > 0 && (
          <ul className="event-options">
            {event.options.map((option) => (
              <li className="option-row" key={option}>
                <EditableText
                  value={option}
                  label={`Rename option: ${option}`}
                  isEditing={
                    target !== null &&
                    target.kind === 'option' &&
                    target.eventId === event.id &&
                    target.option === option
                  }
                  edit={{
                    draft: edit.draft,
                    change: edit.change,
                    commit: edit.commit,
                    cancel: edit.cancel,
                    begin: () =>
                      edit.begin(
                        { kind: 'option', eventId: event.id, option },
                        option,
                      ),
                  }}
                />
                <button
                  type="button"
                  className="row-delete"
                  aria-label={`Remove option ${option}`}
                  onClick={() => onRemoveOption(option)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        className="row-delete"
        aria-label={`Delete ${event.text}`}
        onClick={onDelete}
      >
        ×
      </button>
    </li>
  )
}

// Replaces one day's event list, leaving every other day untouched.
function withEventsPatched(itinerary, date, updater) {
  return itinerary.map((day) =>
    day.date === date ? { ...day, events: updater(day.events) } : day,
  )
}

function App() {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [toast, setToast] = useState(null)
  const [addingDate, setAddingDate] = useState(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  // Separate from the event-add state above so an open event input and an open
  // option input cannot share a draft or block each other's save.
  const [addingOptionId, setAddingOptionId] = useState(null)
  const [optionDraft, setOptionDraft] = useState('')
  const [savingOption, setSavingOption] = useState(false)
  // A single value, which is what makes "one day at a time" structural rather
  // than a rule to remember. reorderEvents is the local working order; nothing
  // reaches the database until Done.
  const [reorderDate, setReorderDate] = useState(null)
  const [reorderEvents, setReorderEvents] = useState([])
  // Day view is the landing state; 'all' is the escape hatch back to the full
  // vertical list. selectedDate stays null until she picks a day, so the default
  // (today, or day one) is recomputed rather than frozen at load time — the app
  // can sit open past midnight and still open on the right day tomorrow.
  const [viewMode, setViewMode] = useState('day')
  const [selectedDate, setSelectedDate] = useState(null)
  const [tab, setTab] = useState('itinerary')
  const [listSeg, setListSeg] = useState('packing')
  // Today as state rather than as a value read during render, so the countdown,
  // the TODAY flag and the default day all roll over on their own at midnight
  // instead of waiting for the next interaction.
  const [todayKey, setTodayKey] = useState(localDateKey)
  const draggingRef = useRef(false)
  // Tap-to-edit, active only inside the mode. editingRef mirrors `editing` so a
  // handler can check-and-clear atomically — that is what makes an
  // Enter-then-blur pair commit once instead of twice.
  const [editing, setEditing] = useState(null)
  const [editDraft, setEditDraft] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const editingRef = useRef(null)

  // Separate sensors so each gets its own activation. The touch delay is what
  // stops a handle from fighting the page: a swipe scrolls, a press-and-hold
  // drags.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  // The last undoable act, mirrored from the data layer: { label } while its
  // undo window is open, null otherwise. Drives the Undo toast.
  const [pendingUndo, setPendingUndo] = useState(null)
  // The option sheet: { date, dayLabel, event, option } or null. Transient by
  // design — it holds the tapped event object, and anything that would stale it
  // (navigation, Edit mode) closes it first.
  const [sheet, setSheet] = useState(null)

  const didScrollRef = useRef(false)
  const inFlightRef = useRef(false)
  const lastFetchRef = useRef(0)

  useEffect(() => subscribePendingUndo(setPendingUndo), [])

  // Escape closes the sheet. Gated on the sheet being open, so it cannot
  // collide with the reorder-mode Escape handler — the sheet never opens
  // inside that mode.
  useEffect(() => {
    if (sheet === null) return
    function onKeyDown(e) {
      if (e.key === 'Escape') setSheet(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sheet])

  const runFetch = useCallback(async (isInitial) => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    const before = writeActivity()
    try {
      const result = await fetchTripData()
      // Drop a snapshot that a write overlapped, or it would undo that write.
      // The initial load is exempt: nothing can have been written before it, and
      // discarding it would leave "Loading trip…" on screen forever.
      if (!isInitial && writeOverlapped(before)) return
      setData(result)
      setLoadError(null)
    } catch (err) {
      // A failed revalidation must not blank the page — keep what's on screen
      // and report it like any other failure.
      if (isInitial) setLoadError(err.message)
      else setToast(err.message)
    } finally {
      inFlightRef.current = false
      lastFetchRef.current = Date.now()
    }
  }, [])

  useEffect(() => {
    runFetch(true)
  }, [runFetch])

  // A minute is fine for a day counter, and setting state to the same string is
  // a no-op in React — so this only actually re-renders once, at midnight.
  useEffect(() => {
    const id = setInterval(() => setTodayKey(localDateKey()), 60000)
    return () => clearInterval(id)
  }, [])

  // Two phones edit the same trip and nothing pushes changes, so pick them up
  // whenever this one comes back to the foreground. `focus` and
  // `visibilitychange` both fire on a tab return; the throttle collapses them.
  useEffect(() => {
    function revalidate() {
      if (document.visibilityState === 'hidden') return
      if (Date.now() - lastFetchRef.current < 2000) return
      runFetch(false)
    }
    window.addEventListener('focus', revalidate)
    document.addEventListener('visibilitychange', revalidate)
    return () => {
      window.removeEventListener('focus', revalidate)
      document.removeEventListener('visibilitychange', revalidate)
    }
  }, [runFetch])

  // Escape abandons the arrangement rather than committing it, matching what
  // Escape already means in every inline input here. Done is the only path that
  // writes. dnd-kit's KeyboardSensor also uses Escape to cancel a keyboard drag,
  // so it gets the first press and this only fires once the drag has settled.
  useEffect(() => {
    if (reorderDate === null) return
    function onKeyDown(e) {
      // Escape is three-deep now: dnd-kit cancels an in-flight drag, an open
      // inline edit reverts itself, and only then does Escape leave the mode.
      if (e.key !== 'Escape') return
      if (draggingRef.current || editingRef.current !== null) return
      setReorderDate(null)
      setReorderEvents([])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [reorderDate])

  // Once, on first load only — never on a revalidation, which would yank the
  // view out from under whatever she was reading.
  //
  // The anchor only exists in the All days list; the Day view already opens on
  // the right day and must not scroll its own header off. So this no-ops on
  // landing and fires the first time she opens All days instead.
  useEffect(() => {
    if (!data || didScrollRef.current) return
    const anchor = document.getElementById('day-anchor')
    if (!anchor) return
    didScrollRef.current = true
    anchor.scrollIntoView({ block: 'start' })
  }, [data, viewMode])

  if (loadError) {
    return (
      <p>
        Could not load trip data: {loadError}{' '}
        <button type="button" className="retry" onClick={() => runFetch(true)}>
          Try again
        </button>
      </p>
    )
  }
  if (!data) return <p>Loading trip…</p>

  const { flights, hotels, itinerary } = data
  const anchorDate = pickAnchorDate(itinerary, todayKey)

  const legs = deriveLegs(itinerary)
  // The selected day is the single source of truth; the active leg is read back
  // from it. Nothing can drift out of sync because there is only one value.
  // A stored date the itinerary no longer contains falls back to the default.
  const hasSelected = itinerary.some((day) => day.date === selectedDate)
  const currentDate = hasSelected
    ? selectedDate
    : pickDefaultDate(itinerary, todayKey)
  const activeLeg =
    legs.find((leg) => leg.days.some((day) => day.date === currentDate)) ??
    legs[0]

  // Leaving a day's arrangement uncommitted is the same situation whether she
  // switches day or switches tab: the Done button would be pointing at something
  // no longer on screen. Both abandon it, exactly as Escape does.
  function leaveDay() {
    if (reorderDate !== null) exitReorder()
    cancelAdd()
    cancelAddOption()
    setSheet(null)
  }

  function selectDate(date) {
    leaveDay()
    setSelectedDate(date)
  }

  function changeTab(next) {
    leaveDay()
    setTab(next)
  }

  const TABS = [
    ['itinerary', 'Itinerary'],
    ['bookings', 'Bookings'],
    ['lists', 'Lists'],
  ]

  function patchEvents(date, updater) {
    setData((prev) => ({
      ...prev,
      itinerary: withEventsPatched(prev.itinerary, date, updater),
    }))
  }

  // Optimistic: flip now, write, put it back if the write fails.
  async function toggleStatus(date, event) {
    const next = event.status === 'open' ? 'confirmed' : 'open'
    const setStatus = (value) => (events) =>
      events.map((e) => (e.id === event.id ? { ...e, status: value } : e))

    patchEvents(date, setStatus(next))
    setToast(null)

    try {
      await setEventStatus(event.id, next)
    } catch (err) {
      patchEvents(date, setStatus(event.status))
      setToast(err.message)
    }
  }

  // Choose commits immediately — it is non-destructive — and its Undo is a
  // compensating write that restores the exact prior {status, chosen_option}
  // pair, offered through the same toast the deletes use. Both directions are
  // optimistic with the standard revert-and-report on failure.
  async function chooseEventOption(date, event, option) {
    const prior = { status: event.status, chosen: event.chosen_option ?? null }
    const applyChoice = (e) => ({
      ...e,
      status: 'confirmed',
      chosen_option: option,
    })
    const applyPrior = (e) => ({
      ...e,
      status: prior.status,
      chosen_option: prior.chosen,
    })

    setSheet(null)
    patchEventEverywhere(date, event.id, applyChoice)
    setToast(null)

    try {
      await chooseOption(event.id, option)
    } catch (err) {
      patchEventEverywhere(date, event.id, applyPrior)
      setToast(err.message)
      return
    }

    offerUndo({
      label: `${event.text} → ${option}`,
      undo: async () => {
        patchEventEverywhere(date, event.id, applyPrior)
        try {
          await setEventDecision(event.id, prior.status, prior.chosen)
        } catch (err) {
          // The choice stands (its write succeeded); put the render back.
          patchEventEverywhere(date, event.id, applyChoice)
          throw err
        }
      },
      onError: setToast,
    })
  }

  // Reopening a decided event: one write clears status and winner together and
  // the full option set is simply rendered again — it never left the row.
  async function reopenChoice(date, event) {
    const prior = { status: event.status, chosen: event.chosen_option ?? null }

    patchEventEverywhere(date, event.id, (e) => ({
      ...e,
      status: 'open',
      chosen_option: null,
    }))
    setToast(null)

    try {
      await reopenEvent(event.id)
    } catch (err) {
      patchEventEverywhere(date, event.id, (e) => ({
        ...e,
        status: prior.status,
        chosen_option: prior.chosen,
      }))
      setToast(err.message)
    }
  }

  // Deletes are staged, not sent: the row leaves the screen immediately, and the
  // write fires only when the undo window closes (stageDelete holds it). Undo
  // splices the captured row back at its captured index — content, options and
  // sort_order all ride along on the object itself, and no write is ever sent.
  //
  // Both are only reachable from inside Edit mode, so both patch reorderEvents
  // as well: that array is what the arranging branch renders, and it is what
  // commitReorder diffs to decide which sort_orders to write. The restore only
  // touches it while the mode still has rows — after leaving the mode the array
  // is empty and must stay that way.
  function removeEvent(date, event) {
    const dayEvents =
      data.itinerary.find((d) => d.date === date)?.events ?? []
    const index = dayEvents.findIndex((e) => e.id === event.id)
    if (index < 0) return
    const arrangeIndex = reorderEvents.findIndex((e) => e.id === event.id)

    patchEvents(date, (events) => events.filter((e) => e.id !== event.id))
    setReorderEvents((prev) => prev.filter((e) => e.id !== event.id))
    setToast(null)

    stageDelete({
      label: `Deleted '${event.text}'`,
      commit: () => deleteEvent(event.id),
      restore: () => {
        patchEvents(date, (events) => {
          const next = [...events]
          next.splice(Math.min(index, next.length), 0, event)
          return next
        })
        setReorderEvents((prev) => {
          if (prev.length === 0 || arrangeIndex < 0) return prev
          const next = [...prev]
          next.splice(Math.min(arrangeIndex, next.length), 0, event)
          return next
        })
      },
      onError: setToast,
    })
  }

  // The capture is for the screen and for Undo; the eventual write derives from
  // a fresh read instead (commitOptionRemoval), because trusting a seconds-old
  // capture would overwrite anything the other phone did to the list meanwhile.
  function removeOption(date, event, option) {
    const currentOptions = event.options ?? []
    if (!currentOptions.includes(option)) return
    const remaining = currentOptions.filter((o) => o !== option)
    // Empty stays null, matching what removeEventOption itself stores.
    const value = remaining.length > 0 ? remaining : null
    // Removing the winner clears the choice — locally here, and in the same
    // write at commit time (commitOptionRemoval reads the fresh row and
    // applies the same rule). Undo restores both.
    const wasChosen = event.chosen_option === option
    const priorChosen = event.chosen_option ?? null

    patchEventEverywhere(date, event.id, (e) => ({
      ...e,
      options: value,
      chosen_option: wasChosen ? null : e.chosen_option,
    }))
    setToast(null)

    stageDelete({
      label: `Removed '${option}'`,
      commit: () => commitOptionRemoval(event.id, option),
      restore: () =>
        patchEventEverywhere(date, event.id, (e) => ({
          ...e,
          options: currentOptions,
          chosen_option: priorChosen,
        })),
      onError: setToast,
    })
  }

  function enterReorder(day) {
    cancelAdd()
    cancelAddOption()
    setSheet(null)
    setReorderDate(day.date)
    setReorderEvents(day.events)
  }

  function exitReorder() {
    closeEdit()
    setReorderDate(null)
    setReorderEvents([])
  }

  function beginEdit(target, currentText) {
    editingRef.current = target
    setEditing(target)
    setEditDraft(currentText)
  }

  function closeEdit() {
    editingRef.current = null
    setEditing(null)
    setEditDraft('')
  }

  // Also patches reorderEvents: that array is what the arranging branch renders,
  // while data.itinerary is what survives leaving the mode and what
  // commitReorder diffs against. Ids never change here, so the reorder diff is
  // unaffected.
  function patchEventEverywhere(date, eventId, updater) {
    patchEvents(date, (events) =>
      events.map((e) => (e.id === eventId ? updater(e) : e)),
    )
    setReorderEvents((prev) =>
      prev.map((e) => (e.id === eventId ? updater(e) : e)),
    )
  }

  async function commitEdit() {
    const target = editingRef.current
    if (target === null || editSaving) return

    const text = editDraft.trim()
    const date = reorderDate

    // Clearing the ref first is what makes the blur that follows Enter a no-op.
    closeEdit()

    // The day's own name. Unlike an event rename, empty is meaningful here: it
    // is how she takes a name back off a day, which is why this writes null
    // rather than rejecting the edit.
    if (target.kind === 'day') {
      const day = data.itinerary.find((d) => d.date === date)
      const next = text === '' ? null : text
      if (!day || next === (day.title ?? null)) return

      setEditSaving(true)
      setToast(null)

      try {
        const saved = await setDayTitle(date, next)
        setData((prev) => ({
          ...prev,
          itinerary: prev.itinerary.map((d) =>
            d.date === date ? { ...d, title: saved } : d,
          ),
        }))
      } catch (err) {
        setToast(err.message)
      } finally {
        setEditSaving(false)
      }
      return
    }

    const event = reorderEvents.find((e) => e.id === target.eventId)
    const current = target.kind === 'event' ? event?.text : target.option

    // Empty is rejected outright, and identical text is not a rename — neither
    // is worth a round-trip.
    if (!event || !text || text === current) return

    setEditSaving(true)
    setToast(null)

    try {
      if (target.kind === 'event') {
        const saved = await setEventText(event.id, text)
        patchEventEverywhere(date, event.id, (e) => ({ ...e, text: saved }))
      } else {
        // chosen_option rides along: renaming the winner moves the pointer in
        // the same write (the data layer's pinned sync rule), so the local
        // patch mirrors both fields.
        const wasChosen = event.chosen_option === target.option
        const saved = await renameEventOption(
          event.id,
          event.options,
          target.option,
          text,
          event.chosen_option ?? null,
        )
        patchEventEverywhere(date, event.id, (e) => ({
          ...e,
          options: saved,
          chosen_option: wasChosen ? text : e.chosen_option,
        }))
      }
    } catch (err) {
      setToast(err.message)
    } finally {
      setEditSaving(false)
    }
  }

  function handleDragEnd({ active, over }) {
    draggingRef.current = false
    if (!over || active.id === over.id) return

    setReorderEvents((prev) => {
      const from = prev.findIndex((e) => e.id === active.id)
      const to = prev.findIndex((e) => e.id === over.id)
      if (from < 0 || to < 0) return prev
      return arrayMove(prev, from, to)
    })
  }

  async function commitReorder() {
    const date = reorderDate
    const ordered = reorderEvents
    const serverOrder =
      data.itinerary.find((day) => day.date === date)?.events ?? []
    const unchanged =
      ordered.length === serverOrder.length &&
      ordered.every((event, i) => event.id === serverOrder[i].id)

    exitReorder()
    if (unchanged) return // nothing moved, so nothing to write

    setToast(null)
    // Renumber locally too, so a later add still computes max + 1 correctly.
    patchEvents(date, () =>
      ordered.map((event, i) => ({ ...event, sort_order: i + 1 })),
    )

    try {
      await reorderDayEvents(date, ordered)
    } catch (err) {
      setToast(err.message)
      runFetch(false) // fall back to whatever order the database actually holds
    }
  }

  async function saveNewOption(date, event, closeAfter = false) {
    const text = optionDraft.trim()
    if (!text || savingOption) return

    setSavingOption(true)
    setToast(null)

    try {
      const nextOptions = await addEventOption(event.id, event.options, text)
      patchEvents(date, (events) =>
        events.map((e) =>
          e.id === event.id ? { ...e, options: nextOptions } : e,
        ),
      )
      setOptionDraft('') // input stays open and focused for the next candidate
      if (closeAfter) setAddingOptionId(null)
    } catch (err) {
      setToast(err.message)
    } finally {
      setSavingOption(false)
    }
  }

  function cancelAddOption() {
    setAddingOptionId(null)
    setOptionDraft('')
  }

  async function saveNewEvent(date, events, closeAfter = false) {
    const text = draft.trim()
    if (!text || saving) return

    setSaving(true)
    setToast(null)

    try {
      const sortOrder = Math.max(0, ...events.map((e) => e.sort_order)) + 1
      const created = await addEvent(date, text, sortOrder)
      patchEvents(date, (list) => [...list, created])
      setDraft('') // input stays open and focused for the next entry
      if (closeAfter) setAddingDate(null)
    } catch (err) {
      setToast(err.message)
    } finally {
      setSaving(false)
    }
  }

  function cancelAdd() {
    setAddingDate(null)
    setDraft('')
  }

  const cityClass = {
    Lisbon: 'city-lisbon',
    Algarve: 'city-algarve',
    'In transit': 'city-transit',
  }

  // One day card, identical in both views — which is what makes every verb
  // inside it (add, delete, toggle, option-×, Edit mode with drag and rename)
  // work in the Day view without being re-implemented there.
  //
  // `index` is the day's position in the whole trip, so the 03 in the corner
  // still means the third day of the trip when only one day is on screen.
  function renderDay(day, index, isAnchor) {
    // The TODAY flag only appears when it genuinely is today. The scroll anchor
    // falls back to the nearest end of the trip, which is a different question.
    const isToday = day.date === todayKey
    const isArranging = reorderDate === day.date
    // A named day is one she has decided something about — "Sintra + fado
    // night" rather than "Lisbon". Unnamed days keep saying where they are; the
    // city is the fallback, not a default she has to clear.
    const dayTitle = day.title ?? day.city

    return (
      <li
        className={`day-card ${cityClass[day.city] ?? ''} ${isToday ? 'day-today' : ''} ${isArranging ? 'day-reordering' : ''}`}
        key={day.date}
        id={isAnchor ? 'day-anchor' : undefined}
        aria-current={isToday ? 'date' : undefined}
      >
        <div className="day-body">
          <div className="day-head">
            <p className="day-date">
              <span className="day-index">
                {String(index + 1).padStart(2, '0')}
              </span>
              {day.weekday}, {day.date}
              {isToday && <span className="day-today-flag">Today</span>}
            </p>
            <div className="day-title-row">
              <h3 className="day-title">
              {isArranging ? (
                // Seeded with the stored title, not with the displayed fallback:
                // opening the field on an unnamed day must not offer the city as
                // text to accept, and clearing it back to empty must mean "no
                // name" rather than "named after the city".
                <EditableText
                  value={dayTitle}
                  label={`Name this day (${day.weekday}, ${day.date})`}
                  placeholder={day.city}
                  isEditing={editing !== null && editing.kind === 'day'}
                  edit={{
                    draft: editDraft,
                    change: setEditDraft,
                    commit: commitEdit,
                    cancel: closeEdit,
                    begin: () => beginEdit({ kind: 'day' }, day.title ?? ''),
                  }}
                />
              ) : (
                dayTitle
              )}
              </h3>
              {isArranging ? (
                <button type="button" className="day-tool" onClick={commitReorder}>
                  Done
                </button>
              ) : (
                // Hidden on every other day while one is in the mode, so a stray
                // tap cannot discard an uncommitted arrangement. Shown on any
                // day with something in it: a single-event day has nothing to
                // arrange, but its text and options are still renamable.
                reorderDate === null &&
                day.events.length > 0 && (
                  <button
                    type="button"
                    className="day-tool"
                    onClick={() => enterReorder(day)}
                  >
                    Edit
                  </button>
                )
              )}
            </div>
          </div>
          {isArranging ? (
            // Only this day's events are inside the SortableContext, so there is
            // no droppable target on any other day — the cross-day constraint is
            // structural, not a runtime check.
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={() => {
                draggingRef.current = true
              }}
              onDragCancel={() => {
                draggingRef.current = false
              }}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={reorderEvents.map((event) => event.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="day-events">
                  {reorderEvents.map((event) => (
                    <SortableEventRow
                      key={event.id}
                      event={event}
                      showHandle={reorderEvents.length > 1}
                      onDelete={() => removeEvent(day.date, event)}
                      onRemoveOption={(option) =>
                        removeOption(day.date, event, option)
                      }
                      edit={{
                        target: editing,
                        draft: editDraft,
                        begin: beginEdit,
                        change: setEditDraft,
                        commit: commitEdit,
                        cancel: closeEdit,
                      }}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          ) : (
          <>
          <ul className="day-events">
            {day.events.map((event) => {
              // Every event carries its status, exactly as shipped — the badge is
              // the toggle, and hiding it anywhere would put a row out of reach.
              // What the redesign changes is the weight, not the coverage: amber
              // OPEN is the only warm thing in the day, and the settled state is
              // a quiet ✓ instead of a second full-strength badge, so a decided
              // event stops competing with an undecided one.
              const isOpen = event.status === 'open'
              const options = event.options ?? []
              const hasOptions = options.length > 0
              // The orphan rule: a chosen_option that matches no current option
              // (a v1-side rename, say) renders as confirmed-without-choice —
              // options listed normally, ✓ kept, nothing invented.
              const chosen =
                event.chosen_option && options.includes(event.chosen_option)
                  ? event.chosen_option
                  : null
              const alsoConsidered = chosen
                ? options.filter((o) => o !== chosen)
                : []
              // Tapping the chip on a decided event reopens it — one verb, one
              // write, winner and status cleared together. Everything else
              // keeps the plain toggle.
              const onChipTap = chosen
                ? () => reopenChoice(day.date, event)
                : () => toggleStatus(day.date, event)

              return (
              <li
                className={`event-row ${isOpen ? 'event-open' : ''}`}
                key={event.id}
              >
                <span className="event-text">
                  {withTimes(event.text)}
                  {chosen && (
                    <>
                      {' — '}
                      <span className="ev-winner">{chosen}</span>
                    </>
                  )}
                </span>{' '}
                <span
                  className={`badge badge-toggle ${isOpen ? 'badge-open' : 'badge-settled'}`}
                  role="button"
                  tabIndex={0}
                  title={
                    chosen
                      ? 'Reopen this decision'
                      : isOpen
                        ? 'Mark this decided'
                        : 'Reopen this decision'
                  }
                  aria-label={`${event.text} — ${
                    chosen
                      ? `decided: ${chosen}, reopen`
                      : isOpen
                        ? 'open, mark decided'
                        : 'decided, reopen'
                  }`}
                  onClick={onChipTap}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onChipTap()
                    }
                  }}
                >
                  {isOpen ? 'OPEN' : '✓'}
                </span>
                {/* A decided event folds its candidates away: the winner is in
                    the title, the rest collapse to one muted line, and + option
                    waits behind a reopen. */}
                {chosen && alsoConsidered.length > 0 && (
                  <p className="also">
                    Also considered · {alsoConsidered.join(' · ')}
                  </p>
                )}
                {/* Candidates are worth offering while the decision is open, or
                    whenever some are already recorded. A confirmed event with
                    none needs nothing. Unchanged by the badge rule above: this
                    is the path by which a plain event grows its first candidate
                    and so earns a badge.
                    Each candidate is now a control: tapping opens the sheet
                    where Choose this lives. */}
                {!chosen && (hasOptions || isOpen) && (
                  <ul className="opts">
                    {options.map((option) => (
                      <li className="opt-item" key={option}>
                        <button
                          type="button"
                          className="opt opt-tap"
                          onClick={() =>
                            setSheet({
                              date: day.date,
                              dayLabel: `${day.weekday}, ${shortDate(day.date)}`,
                              event,
                              option,
                            })
                          }
                        >
                          {option}
                        </button>
                      </li>
                    ))}
                    <li className="opt-add-row">
                      {addingOptionId === event.id ? (
                        <input
                          className="add-input"
                          autoFocus
                          value={optionDraft}
                          placeholder="New option"
                          aria-label={`New option for ${event.text}`}
                          onChange={(e) => setOptionDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              saveNewOption(day.date, event)
                            }
                            if (e.key === 'Escape') cancelAddOption()
                          }}
                          onBlur={() => {
                            if (optionDraft.trim()) {
                              saveNewOption(day.date, event, true)
                            } else {
                              cancelAddOption()
                            }
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="opt opt-add"
                          onClick={() => {
                            setAddingOptionId(event.id)
                            setOptionDraft('')
                          }}
                        >
                          + option
                        </button>
                      )}
                    </li>
                  </ul>
                )}
              </li>
              )
            })}
          </ul>
          <div className="add-row">
            {addingDate === day.date ? (
              <input
                className="add-input"
                autoFocus
                value={draft}
                placeholder="New event"
                aria-label={`New event on ${day.date}`}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveNewEvent(day.date, day.events)
                  if (e.key === 'Escape') cancelAdd()
                }}
                onBlur={() => {
                  if (draft.trim()) saveNewEvent(day.date, day.events, true)
                  else cancelAdd()
                }}
              />
            ) : (
              <button
                type="button"
                className="addrow"
                onClick={() => {
                  setAddingDate(day.date)
                  setDraft('')
                }}
              >
                + Add activity
              </button>
            )}
          </div>
          </>
          )}
        </div>
      </li>
    )
  }

  return (
    <>
      {/* The option sheet: where Choose this lives. A bottom sheet rather than
          an inline control so the decision moment gets the option's full
          context — name, meta line, map — before committing. */}
      {sheet && (
        <div
          className="sheet-scrim"
          onClick={() => setSheet(null)}
          role="presentation"
        >
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={sheet.option}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="sheet-kicker">
              {sheet.event.text} · {sheet.dayLabel}
            </p>
            <h3 className="sheet-title">{sheet.option}</h3>
            {sheet.event.options_meta?.[sheet.option]?.meta && (
              <p className="sheet-meta">
                {sheet.event.options_meta[sheet.option].meta}
              </p>
            )}
            <button
              type="button"
              className="sheet-btn sheet-btn-primary"
              onClick={() =>
                chooseEventOption(sheet.date, sheet.event, sheet.option)
              }
            >
              Choose this
            </button>
            {sheet.event.options_meta?.[sheet.option]?.maps_q && (
              <a
                className="sheet-btn sheet-btn-ghost"
                href={mapsUrl(sheet.event.options_meta[sheet.option].maps_q)}
                target="_blank"
                rel="noreferrer"
              >
                Open in Maps
              </a>
            )}
            <button
              type="button"
              className="sheet-btn sheet-btn-plain"
              onClick={() => setSheet(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Errors and the undo window stack rather than compete: a failure
          arriving while a delete is still undoable must not hide the Undo. */}
      {(toast || pendingUndo) && (
        <div className="toast-stack">
          {toast && (
            <div className="toast" role="status" aria-live="polite">
              <span className="toast-text">{toast}</span>
              <button
                type="button"
                className="toast-dismiss"
                aria-label="Dismiss message"
                onClick={() => setToast(null)}
              >
                ×
              </button>
            </div>
          )}
          {pendingUndo && (
            <div className="toast toast-undo" role="status" aria-live="polite">
              <span className="toast-text">{pendingUndo.label}</span>
              <button
                type="button"
                className="toast-undo-btn"
                onClick={undoPending}
              >
                Undo
              </button>
            </div>
          )}
        </div>
      )}

      {/* Every line here is read off the itinerary — the dates, the year and the
          leg names all move if the trip does. */}
      <header id="trip-header">
        <TileRow />
        <div className="hero-inner">
          <p className="eyebrow">The family trip</p>
          <h1>Portugal</h1>
          <p className="hero-dates">
            {shortDate(itinerary[0].date)} —{' '}
            {shortDate(itinerary[itinerary.length - 1].date)}{' '}
            {itinerary[0].date.slice(0, 4)} ·{' '}
            {legs.map((leg) => leg.city).join(' & ')}
          </p>
          <Countdown itinerary={itinerary} todayKey={todayKey} />
        </div>
        <TileRow />
      </header>

      <main className="app-main">
      {tab === 'itinerary' && (
      <section id="itinerary-section">
        <div className="section-head">
          <h2>Itinerary</h2>
          <button
            type="button"
            className="view-toggle"
            aria-pressed={viewMode === 'all'}
            onClick={() => setViewMode(viewMode === 'day' ? 'all' : 'day')}
          >
            {viewMode === 'day' ? 'All days' : 'One day'}
          </button>
        </div>

        {viewMode === 'day' ? (
          <>
            {legs.length > 1 && (
              <div className="legs" role="tablist" aria-label="Trip legs">
                {legs.map((leg) => (
                  <button
                    key={leg.id}
                    type="button"
                    role="tab"
                    aria-selected={leg === activeLeg}
                    className={`leg ${leg === activeLeg ? 'leg-on' : ''}`}
                    // Jumps to the leg's first day, not the day at the same
                    // offset — a leg is entered at its beginning.
                    onClick={() => selectDate(leg.days[0].date)}
                  >
                    <span className="leg-name">{leg.city}</span>
                    <span className="leg-sub">
                      {shortDate(leg.days[0].date)} –{' '}
                      {shortDate(leg.days[leg.days.length - 1].date)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="strip">
              {activeLeg.days.map((day) => (
                <button
                  key={day.date}
                  type="button"
                  className={`daytile ${day.date === currentDate ? 'daytile-on' : ''} ${day.date === todayKey ? 'daytile-today' : ''}`}
                  aria-current={day.date === currentDate ? 'true' : undefined}
                  aria-label={`${day.weekday}, ${day.date}`}
                  onClick={() => selectDate(day.date)}
                >
                  <span className="dt-dow">{day.weekday.slice(0, 3)}</span>
                  <span className="dt-num">{dayOfMonth(day.date)}</span>
                </button>
              ))}
            </div>

            <ol id="itinerary">
              {itinerary
                .map((day, index) => [day, index])
                .filter(([day]) => day.date === currentDate)
                .map(([day, index]) => renderDay(day, index, false))}
            </ol>
          </>
        ) : (
          <ol id="itinerary">
            {itinerary.map((day, index) =>
              renderDay(day, index, day.date === anchorDate),
            )}
          </ol>
        )}
      </section>
      )}

      {/* Reservations are content, not a decision: these carry whatever status
          their row holds and are not part of the open ⇄ confirmed axis the
          itinerary badges toggle. Every field rendered here is one v1 already
          rendered — no invented columns. */}
      {tab === 'bookings' && (
      <section id="bookings">
        <h2>Bookings</h2>
        <ul className="bookings">
          {flights.map((f) => (
            <li className="bk" key={f.id}>
              <span className="bk-icon bk-flight" aria-hidden="true">
                ✈
              </span>
              <span className="bk-body">
                <span className="bk-name">
                  {f.from} <span className="ticket-arrow">→</span> {f.to}
                </span>
                <span className="bk-detail">{f.airline ?? 'airline TBD'}</span>
              </span>
              <span className={`badge badge-${f.status}`}>
                {formatStatus(f.status)}
              </span>
            </li>
          ))}
          {hotels.map((h) => (
            <li className="bk" key={h.id}>
              <span className="bk-icon bk-stay" aria-hidden="true">
                ⌂
              </span>
              <span className="bk-body">
                <span className="bk-name">{h.name}</span>
                <span className="bk-when">
                  {shortDate(h.checkIn)} – {shortDate(h.checkOut)}
                </span>
                <span className="bk-detail">
                  cancel by {shortDate(h.cancellationDeadline)}
                </span>
              </span>
              <span className={`badge badge-${h.status}`}>
                {formatStatus(h.status)}
              </span>
            </li>
          ))}
        </ul>
      </section>
      )}

      {/* The two checklists, unchanged, one at a time. Each still renders its own
          <section> with its own heading — the heading is hidden visually here
          because the segment above already says which list this is, but stays in
          the accessibility tree as the section's name. */}
      {tab === 'lists' && (
      <section id="lists-tab" className="lists-tab" aria-label="Lists">
        <div className="seg" role="tablist" aria-label="Which list">
          {[
            ['packing', 'Packing'],
            ['prep', 'Trip prep'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={listSeg === id}
              className={listSeg === id ? 'seg-on' : ''}
              onClick={() => setListSeg(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {listSeg === 'packing' ? (
          <PackingList
            groups={data.packingGroups}
            onError={setToast}
          />
        ) : (
          <TripPrep
            groups={data.prepGroups}
            onError={setToast}
          />
        )}
      </section>
      )}
      </main>

      <nav className="tabbar" aria-label="Sections">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`tabbar-btn ${tab === id ? 'tabbar-on' : ''}`}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => changeTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
    </>
  )
}

export default App
