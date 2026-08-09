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
  deleteEvent,
  fetchTripData,
  removeEventOption,
  renameEventOption,
  reorderDayEvents,
  setEventStatus,
  setEventText,
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

// Where to scroll on first load. Today when the trip is running; otherwise the
// nearest end of it, so the app always opens on a useful day. ISO dates compare
// correctly as strings.
function pickAnchorDate(itinerary, todayKey) {
  if (itinerary.length === 0) return null
  if (itinerary.some((day) => day.date === todayKey)) return todayKey
  if (todayKey < itinerary[0].date) return itinerary[0].date
  return itinerary[itinerary.length - 1].date
}

// One event while its day is being arranged: a drag handle, the text, and the
// candidates that travel with it. Every editing control is deliberately absent —
// the card should read as arranging, not editing.
// One tap-to-edit label. Renders as prose until tapped, then as an input.
// Escape stops propagation so it reverts this edit rather than reaching the
// window handler that exits the whole mode.
function EditableText({ value, label, isEditing, edit }) {
  if (isEditing) {
    return (
      <input
        className="add-input"
        autoFocus
        value={edit.draft}
        aria-label={label}
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

function SortableEventRow({ event, edit, showHandle }) {
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
              </li>
            ))}
          </ul>
        )}
      </div>
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

  const didScrollRef = useRef(false)
  const inFlightRef = useRef(false)
  const lastFetchRef = useRef(0)
  const suppressRevalidateUntilRef = useRef(0)

  // window.confirm blurs the window and refocuses it on dismissal, which would
  // otherwise trigger the focus revalidation below — starting a refetch while the
  // dialog is still open, so it resolves after the delete and resurrects the row.
  // The refocus event arrives after confirm() returns, so the guard has to
  // outlast the call itself.
  const confirmAction = useCallback((message) => {
    suppressRevalidateUntilRef.current = Date.now() + 2000
    try {
      return window.confirm(message)
    } finally {
      suppressRevalidateUntilRef.current = Date.now() + 2000
    }
  }, [])

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

  // Two phones edit the same trip and nothing pushes changes, so pick them up
  // whenever this one comes back to the foreground. `focus` and
  // `visibilitychange` both fire on a tab return; the throttle collapses them.
  useEffect(() => {
    function revalidate() {
      if (document.visibilityState === 'hidden') return
      if (Date.now() < suppressRevalidateUntilRef.current) return
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
  useEffect(() => {
    if (!data || didScrollRef.current) return
    didScrollRef.current = true
    document.getElementById('day-anchor')?.scrollIntoView({ block: 'start' })
  }, [data])

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
  const todayKey = localDateKey()
  const anchorDate = pickAnchorDate(itinerary, todayKey)

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

  // Add, delete, and option-removal are not optimistic — the write lands first,
  // then the UI.
  async function removeEvent(date, event) {
    if (!confirmAction(`Delete '${event.text}'?`)) return
    setToast(null)

    try {
      await deleteEvent(event.id)
      patchEvents(date, (events) => events.filter((e) => e.id !== event.id))
    } catch (err) {
      setToast(err.message)
    }
  }

  async function removeOption(date, event, option) {
    if (!confirmAction(`Remove option '${option}'?`)) return
    setToast(null)

    try {
      const nextOptions = await removeEventOption(
        event.id,
        event.options,
        option,
      )
      patchEvents(date, (events) =>
        events.map((e) =>
          e.id === event.id ? { ...e, options: nextOptions } : e,
        ),
      )
    } catch (err) {
      setToast(err.message)
    }
  }

  function enterReorder(day) {
    cancelAdd()
    cancelAddOption()
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
    const event = reorderEvents.find((e) => e.id === target.eventId)
    const current = target.kind === 'event' ? event?.text : target.option

    // Clearing the ref first is what makes the blur that follows Enter a no-op.
    closeEdit()

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
        const saved = await renameEventOption(
          event.id,
          event.options,
          target.option,
          text,
        )
        patchEventEverywhere(date, event.id, (e) => ({ ...e, options: saved }))
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

  const dayNodes = []

  const cityClass = {
    Lisbon: 'city-lisbon',
    Algarve: 'city-algarve',
    'In transit': 'city-transit',
  }

  itinerary.forEach((day, index) => {
    // The TODAY flag only appears when it genuinely is today. The scroll anchor
    // falls back to the nearest end of the trip, which is a different question.
    const isToday = day.date === todayKey
    const isAnchor = day.date === anchorDate
    const isArranging = reorderDate === day.date

    dayNodes.push(
      <li
        className={`day-card ${cityClass[day.city] ?? ''} ${isToday ? 'day-today' : ''} ${isArranging ? 'day-reordering' : ''}`}
        key={day.date}
        id={isAnchor ? 'day-anchor' : undefined}
        aria-current={isToday ? 'date' : undefined}
      >
        <span className="day-index">{String(index + 1).padStart(2, '0')}</span>
        <div className="day-body">
          <div className="day-card-header">
            <span className="day-date">
              {day.weekday}, {day.date}
              {isToday && <span className="day-today-flag">Today</span>}
            </span>
            <span className="day-city">
              {day.city}
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
            </span>
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
            {day.events.map((event) => (
              <li className="event-row" key={event.id}>
                <span className="event-text">{event.text}</span>{' '}
                <span
                  className={`badge badge-${event.status === 'open' ? 'candidate' : 'confirmed'} badge-toggle`}
                  role="button"
                  tabIndex={0}
                  title="Change status"
                  onClick={() => toggleStatus(day.date, event)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleStatus(day.date, event)
                    }
                  }}
                >
                  {formatStatus(event.status)}
                </span>
                <button
                  type="button"
                  className="row-delete"
                  aria-label={`Delete ${event.text}`}
                  onClick={() => removeEvent(day.date, event)}
                >
                  ×
                </button>
                {/* Candidates are worth offering while the decision is open, or
                    whenever some are already recorded. A confirmed event with
                    none needs nothing. */}
                {((event.options && event.options.length > 0) ||
                  event.status === 'open') && (
                  <ul className="event-options">
                    {(event.options ?? []).map((option) => (
                      <li className="option-row" key={option}>
                        <span className="option-text">{option}</span>
                        <button
                          type="button"
                          className="row-delete"
                          aria-label={`Remove option ${option}`}
                          onClick={() => removeOption(day.date, event, option)}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                    <li className="option-add-row">
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
                          className="add-toggle"
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
            ))}
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
                className="add-toggle"
                onClick={() => {
                  setAddingDate(day.date)
                  setDraft('')
                }}
              >
                + Add
              </button>
            )}
          </div>
          </>
          )}
        </div>
      </li>,
    )
  })

  return (
    <>
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

      <header id="trip-header">
        <p className="eyebrow">28 Aug – 6 Sep 2026 · Lisbon &amp; the Algarve</p>
        <h1>Portugal</h1>
      </header>
      <div className="tile-strip" aria-hidden="true" />

      <section id="itinerary-section">
        <h2>Itinerary</h2>
        <ol id="itinerary">{dayNodes}</ol>
      </section>

      <PackingList
        groups={data.packingGroups}
        onError={setToast}
        onConfirm={confirmAction}
      />
      <TripPrep
        groups={data.prepGroups}
        onError={setToast}
        onConfirm={confirmAction}
      />

      <section id="bookings">
        <h2>Bookings</h2>
        <div className="booking-grid">
          <div className="ticket-card">
            <h3>Flights</h3>
            <ul>
              {flights.map((f) => (
                <li key={f.id}>
                  <span className="ticket-route">
                    {f.from} <span className="ticket-arrow">→</span> {f.to}
                  </span>
                  <span className="ticket-meta">{f.airline ?? 'airline TBD'}</span>
                  <span className={`badge badge-${f.status}`}>
                    {formatStatus(f.status)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="ticket-card">
            <h3>Stays</h3>
            <ul>
              {hotels.map((h) => (
                <li key={h.id}>
                  <span className="ticket-route">{h.name}</span>
                  <span className="ticket-meta">
                    {h.checkIn} – {h.checkOut} · cancel by {h.cancellationDeadline}
                  </span>
                  <span className={`badge badge-${h.status}`}>
                    {formatStatus(h.status)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  )
}

export default App
