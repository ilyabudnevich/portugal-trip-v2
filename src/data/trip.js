// Static trip data for Portugal 2026 (Aug 28 - Sep 6).
// Plain data only — no logic, no React.
// `status` is one of:
//   - flights/hotels: 'booked'
//   - restaurants: 'candidate' | 'confirmed'

export const flights = [
  {
    id: 'ewr-lis',
    airline: 'TAP Air Portugal',
    from: 'Newark (EWR)',
    to: 'Lisbon (LIS)',
    departure: '2026-08-28T23:00',
    arrival: '2026-08-29', // lands the morning of Aug 29; exact time not confirmed
    notes: 'Overnight flight.',
    status: 'booked',
  },
  {
    id: 'fao-jfk',
    airline: 'British Airways + American Airlines (via LHR)',
    from: 'Faro (FAO)',
    to: 'New York (JFK)',
    departure: '2026-09-06T12:15',
    arrival: '2026-09-06T21:05',
    via: 'London Heathrow (LHR)',
    notes: 'Connects through London Heathrow.',
    status: 'booked',
  },
]

export const hotels = [
  {
    id: 'martinhal-chiado',
    name: 'Martinhal Chiado',
    city: 'Lisbon',
    checkIn: '2026-08-29',
    checkOut: '2026-09-01',
    nights: 3,
    cancellationDeadline: '2026-07-29',
    status: 'booked',
  },
  {
    id: 'pine-cliffs',
    name: 'Pine Cliffs Ocean Suites',
    city: 'Algarve',
    checkIn: '2026-09-01',
    checkOut: '2026-09-06',
    nights: 5,
    cancellationDeadline: '2026-08-30',
    status: 'booked',
  },
]

export const restaurants = [
  { id: 'ramiro', name: 'Ramiro', city: 'Lisbon', status: 'candidate' },
  { id: 'solar-dos-presuntos', name: 'Solar dos Presuntos', city: 'Lisbon', status: 'candidate' },
  { id: 'veneza', name: 'Veneza', city: 'Algarve', status: 'candidate' },
  { id: 'o-charneco', name: 'O Charneco', city: 'Algarve', status: 'candidate' },
  { id: 'rei-das-praias', name: 'Rei das Praias', city: 'Algarve', status: 'candidate' },
]

export const itinerary = [
  {
    date: '2026-08-28',
    weekday: 'Friday',
    city: 'In transit',
    events: ['Overnight flight EWR → LIS (TAP Air Portugal), departs 11:00 PM'],
  },
  {
    date: '2026-08-29',
    weekday: 'Saturday',
    city: 'Lisbon',
    events: ['Land in Lisbon, morning', 'Check in: Martinhal Chiado'],
  },
  {
    date: '2026-08-30',
    weekday: 'Sunday',
    city: 'Lisbon',
    events: ['Free day in Lisbon'],
  },
  {
    date: '2026-08-31',
    weekday: 'Monday',
    city: 'Lisbon',
    events: ['Free day in Lisbon'],
  },
  {
    date: '2026-09-01',
    weekday: 'Tuesday',
    city: 'Algarve',
    events: [
      'Check out: Martinhal Chiado',
      'Transfer from Lisbon to the Algarve',
      'Check in: Pine Cliffs Ocean Suites',
    ],
  },
  {
    date: '2026-09-02',
    weekday: 'Wednesday',
    city: 'Algarve',
    events: ['Free day in the Algarve'],
  },
  {
    date: '2026-09-03',
    weekday: 'Thursday',
    city: 'Algarve',
    events: ['Free day in the Algarve'],
  },
  {
    date: '2026-09-04',
    weekday: 'Friday',
    city: 'Algarve',
    events: ['Free day in the Algarve'],
  },
  {
    date: '2026-09-05',
    weekday: 'Saturday',
    city: 'Algarve',
    events: ['Free day in the Algarve'],
  },
  {
    date: '2026-09-06',
    weekday: 'Sunday',
    city: 'Algarve',
    events: [
      'Check out: Pine Cliffs Ocean Suites',
      'Flight FAO → JFK departs 12:15 PM (via London Heathrow)',
      'Arrive JFK 9:05 PM',
    ],
  },
]
