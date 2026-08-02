import { flights, hotels, itinerary } from './data/trip.js'
import PackingList from './components/PackingList.jsx'
import TripPrep from './components/TripPrep.jsx'
import './App.css'

function formatStatus(status) {
  return status.toUpperCase()
}

function App() {
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
              <li key={event.text}>
                {event.text}{' '}
                <span
                  className={`badge badge-${event.options ? 'candidate' : 'confirmed'}`}
                >
                  {formatStatus(event.options ? 'open' : 'confirmed')}
                </span>
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
        <ol id="itinerary">{dayNodes}</ol>
      </section>

      <PackingList />
      <TripPrep />
    </>
  )
}

export default App
