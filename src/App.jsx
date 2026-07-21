import { flights, hotels, restaurants, itinerary } from './data/trip.js'
import './App.css'

function formatStatus(status) {
  return status.toUpperCase()
}

function App() {
  const dayNodes = []

  itinerary.forEach((day, index) => {
    dayNodes.push(
      <li className="day-card" key={day.date}>
        <div className="day-card-header">
          <span className="day-date">
            {day.weekday}, {day.date}
          </span>
          <span className="day-city">{day.city}</span>
        </div>
        <ul className="day-events">
          {day.events.map((event) => (
            <li key={event}>{event}</li>
          ))}
        </ul>
      </li>,
    )

    const isFirstAlgarveDay = day.city === 'Algarve' && itinerary[index - 1]?.city !== 'Algarve'
    const isLastLisbonDay = day.city === 'Lisbon' && itinerary[index + 1]?.city !== 'Lisbon'
    const groupCity = isFirstAlgarveDay ? 'Algarve' : isLastLisbonDay ? 'Lisbon' : null

    if (groupCity) {
      const candidates = restaurants.filter((r) => r.city === groupCity)
      dayNodes.push(
        <li className="restaurant-group" key={`${groupCity}-restaurants`}>
          <h3>{groupCity} candidates</h3>
          <ul>
            {candidates.map((r) => (
              <li key={r.id}>
                {r.name}{' '}
                <span className={`badge badge-${r.status}`}>
                  {formatStatus(r.status)}
                </span>
              </li>
            ))}
          </ul>
        </li>,
      )
    }
  })

  return (
    <>
      <header id="trip-header">
        <h1>Portugal 2026</h1>
        <p>Aug 28 – Sep 6</p>
      </header>

      <section id="bookings">
        <h2>Bookings</h2>
        <ul>
          {flights.map((f) => (
            <li key={f.id}>
              {f.from} → {f.to} ({f.airline ?? 'airline TBD'}){' '}
              <span className={`badge badge-${f.status}`}>
                {formatStatus(f.status)}
              </span>
            </li>
          ))}
          {hotels.map((h) => (
            <li key={h.id}>
              {h.name} ({h.checkIn} – {h.checkOut}){' '}
              <span className={`badge badge-${h.status}`}>
                {formatStatus(h.status)}
              </span>
              {' — cancel by '}
              {h.cancellationDeadline}
            </li>
          ))}
        </ul>
      </section>

      <ol id="itinerary">{dayNodes}</ol>
    </>
  )
}

export default App
