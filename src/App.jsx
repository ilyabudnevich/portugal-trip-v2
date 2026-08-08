import { useEffect, useState } from 'react'
import {
  addEvent,
  deleteEvent,
  fetchTripData,
  setEventStatus,
} from './lib/tripData.js'
import PackingList from './components/PackingList.jsx'
import TripPrep from './components/TripPrep.jsx'
import './App.css'

function formatStatus(status) {
  return status.toUpperCase()
}

// Replaces one day's event list, leaving every other day untouched.
function withEventsPatched(itinerary, date, updater) {
  return itinerary.map((day) =>
    day.date === date ? { ...day, events: updater(day.events) } : day,
  )
}

function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [editError, setEditError] = useState(null)
  const [addingDate, setAddingDate] = useState(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let ignore = false
    fetchTripData()
      .then((result) => {
        if (!ignore) setData(result)
      })
      .catch((err) => {
        if (!ignore) setError(err.message)
      })
    return () => {
      ignore = true
    }
  }, [])

  if (error) return <p>Could not load trip data: {error}</p>
  if (!data) return <p>Loading trip…</p>

  const { flights, hotels, itinerary } = data

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
    setEditError(null)

    try {
      await setEventStatus(event.id, next)
    } catch (err) {
      patchEvents(date, setStatus(event.status))
      setEditError(err.message)
    }
  }

  // Add and delete are not optimistic — the write lands first, then the UI.
  async function removeEvent(date, event) {
    if (!window.confirm(`Delete '${event.text}'?`)) return
    setEditError(null)

    try {
      await deleteEvent(event.id)
      patchEvents(date, (events) => events.filter((e) => e.id !== event.id))
    } catch (err) {
      setEditError(err.message)
    }
  }

  async function saveNewEvent(date, events) {
    const text = draft.trim()
    if (!text || saving) return

    setSaving(true)
    setEditError(null)

    try {
      const sortOrder = Math.max(0, ...events.map((e) => e.sort_order)) + 1
      const created = await addEvent(date, text, sortOrder)
      patchEvents(date, (list) => [...list, created])
      setDraft('') // input stays open and focused for the next entry
    } catch (err) {
      setEditError(err.message)
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
    dayNodes.push(
      <li
        className={`day-card ${cityClass[day.city] ?? ''}`}
        key={day.date}
      >
        <span className="day-index">{String(index + 1).padStart(2, '0')}</span>
        <div className="day-body">
          <div className="day-card-header">
            <span className="day-date">
              {day.weekday}, {day.date}
            </span>
            <span className="day-city">{day.city}</span>
          </div>
          <ul className="day-events">
            {day.events.map((event) => (
              <li key={event.id}>
                {event.text}{' '}
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
                </span>{' '}
                <button
                  type="button"
                  className="row-delete"
                  aria-label={`Delete ${event.text}`}
                  onClick={() => removeEvent(day.date, event)}
                >
                  ×
                </button>
                {event.options && (
                  <ul>
                    {event.options.map((option) => (
                      <li key={option}>{option}</li>
                    ))}
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
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveNewEvent(day.date, day.events)
                  if (e.key === 'Escape') cancelAdd()
                }}
                onBlur={() => {
                  if (!draft.trim()) cancelAdd()
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
        </div>
      </li>,
    )
  })

  return (
    <>
      <header id="trip-header">
        <p className="eyebrow">28 Aug – 6 Sep 2026 · Lisbon &amp; the Algarve</p>
        <h1>Portugal</h1>
      </header>
      <div className="tile-strip" aria-hidden="true" />

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

      <section id="itinerary-section">
        <h2>Itinerary</h2>
        {editError && <p>Could not save: {editError}</p>}
        <ol id="itinerary">{dayNodes}</ol>
      </section>

      <PackingList groups={data.packingGroups} />
      <TripPrep groups={data.prepGroups} />
    </>
  )
}

export default App
