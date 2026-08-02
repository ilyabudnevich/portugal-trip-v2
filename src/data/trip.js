// Static trip data for Portugal 2026 (Aug 28 - Sep 6).
// Plain data only — no logic, no React.
// `status` on flights and hotels is 'booked'.

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

export const itinerary = [
  {
    date: '2026-08-28',
    weekday: 'Friday',
    city: 'In transit',
    events: [{ text: 'TAP TP204, EWR → LIS, departs 23:00 (overnight)' }],
  },
  {
    date: '2026-08-29',
    weekday: 'Saturday',
    city: 'Lisbon',
    events: [
      { text: 'Arrive LIS 11:00' },
      { text: 'Check in: Martinhal Lisbon Chiado (res 3188)' },
      {
        text: 'Late afternoon',
        options: [
          'Tuk-tuk tour',
          'Praça do Comércio + Rua Augusta wander',
          'Cais do Sodré–Cacilhas ferry',
        ],
      },
      { text: 'Tuk-tuk tour, late afternoon — Alfama, miradouros, castle hill, Baixa' },
      { text: 'Dinner', options: ['Ramiro', 'Somewhere else'] },
      { text: 'Dinner: Time Out Market' },
      {
        text: 'Sunset ritual — gelato or a pastel de nata, each child names one thing she loved, one family selfie',
      },
    ],
  },
  {
    date: '2026-08-30',
    weekday: 'Sunday',
    city: 'Lisbon',
    events: [
      { text: 'Free day in Lisbon' },
      { text: 'Oceanário de Lisboa, 10:00 — timed tickets required' },
      { text: 'Cable car along the river' },
      { text: 'Lunch', options: ['Solar dos Presuntos', 'Somewhere else'] },
      { text: 'Lunch: Parque das Nações' },
      {
        text: 'Early afternoon',
        options: ['Pastel de nata baking class', 'Skip it'],
      },
      { text: 'Downtime at hotel, 13:30–15:00' },
      { text: 'Pyjama Club, 18:00–23:00 (both kids)' },
      { text: 'Gambrinus, 19:30 — dinner, 2 adults' },
      {
        text: 'Sunset ritual — gelato or a pastel de nata, each child names one thing she loved, one family selfie',
      },
    ],
  },
  {
    date: '2026-08-31',
    weekday: 'Monday',
    city: 'Lisbon',
    events: [
      { text: 'Free day in Lisbon' },
      { text: 'Pena Palace, 09:30 — grounds and terraces only' },
      { text: 'Piriquita pastries to go' },
      {
        text: 'Lunch',
        options: ['Azenhas do Mar (reserve ahead)', 'Alternative near Sintra'],
      },
      { text: 'Back to Lisbon, 15:00 — downtime' },
      { text: 'Pyjama Club, 18:00–23:00 (both kids)' },
      { text: 'Fado in Chiado, 19:00–19:50 (booking 368468881)' },
      { text: 'JNcQUOI Avenida, 19:45 — dinner, 2 adults' },
      {
        text: 'Sunset ritual — gelato or a pastel de nata, each child names one thing she loved, one family selfie',
      },
    ],
  },
  {
    date: '2026-09-01',
    weekday: 'Tuesday',
    city: 'Algarve',
    events: [
      { text: 'Check out: Martinhal Chiado, 08:30 — Uber XL to LIS airport' },
      { text: 'Rental car pickup, 10:00, Lisbon Airport (LIS) — conf 398444774' },
      { text: 'Óbidos, 11:40 — walled village, Rua Direita, wall walk, ginjinha' },
      { text: 'Hard departure from Óbidos, 13:30' },
      { text: 'Transfer from Lisbon to the Algarve' },
      { text: 'Arrive Pine Cliffs ~17:00, check in: Pine Cliffs Ocean Suites' },
      { text: 'Dinner', options: ['Casa Falésia'] },
      {
        text: 'Sunset ritual — gelato or a pastel de nata, each child names one thing she loved, one family selfie',
      },
    ],
  },
  {
    date: '2026-09-02',
    weekday: 'Wednesday',
    city: 'Algarve',
    events: [
      { text: 'Free day in the Algarve' },
      { text: "Porto Pirata kids' club, 09:30–17:00" },
      { text: 'Praia da Falésia via the cliff path (PM)' },
      {
        text: 'Dinner',
        options: ['Veneza', 'O Charneco', "Restaurante Olhos d'Água"],
      },
      {
        text: 'Sunset ritual — gelato or a pastel de nata, each child names one thing she loved, one family selfie',
      },
    ],
  },
  {
    date: '2026-09-03',
    weekday: 'Thursday',
    city: 'Algarve',
    events: [
      { text: 'Free day in the Algarve' },
      {
        text: 'Benagil boat (morning)',
        options: ['Pine Cliffs catamaran', 'Albufeira marina tour'],
      },
      {
        text: 'Lunch',
        options: [
          'Carvoeiro',
          'Ferragudo square',
          'Rei das Praias (Caneiros)',
          'Back to the resort',
        ],
      },
      {
        text: 'Optional: Algar Seco boardwalk or Praia da Marinha rock pools at low tide',
      },
      {
        text: 'Dinner',
        options: [
          'Casa Falésia',
          'O Pássaro Azul',
          'La Cigale',
          'Rei das Praias',
          'Ferragudo waterfront',
          'Vilamoura marina',
        ],
      },
      {
        text: 'Sunset ritual — gelato or a pastel de nata, each child names one thing she loved, one family selfie',
      },
    ],
  },
  {
    date: '2026-09-04',
    weekday: 'Friday',
    city: 'Algarve',
    events: [
      { text: 'Free day in the Algarve' },
      { text: "Porto Pirata kids' club (AM)" },
      {
        text: 'Lunch',
        options: ['Purobeach Vilamoura', "Maria's (Falésia–Santa Eulália)"],
      },
      { text: 'Afternoon deliberately empty — no plans, nothing to be late for' },
      { text: 'Dinner', options: ['Lemon Square at the resort — live music'] },
      {
        text: 'Sunset ritual — gelato or a pastel de nata, each child names one thing she loved, one family selfie',
      },
    ],
  },
  {
    date: '2026-09-05',
    weekday: 'Saturday',
    city: 'Algarve',
    events: [
      { text: 'Free day in the Algarve' },
      { text: 'Beach (morning)' },
      {
        text: 'Lunch',
        options: [
          'Casa Falésia',
          'O Pássaro Azul',
          'La Cigale',
          'Rei das Praias',
          'Ferragudo waterfront',
          'Vilamoura marina',
        ],
      },
      { text: 'Pack' },
      { text: 'Mirador clifftop bar at golden hour' },
      {
        text: 'Sunset ritual — gelato or a pastel de nata, each child names one thing she loved, one family selfie',
      },
    ],
  },
  {
    date: '2026-09-06',
    weekday: 'Sunday',
    city: 'Algarve',
    events: [
      { text: 'Check out: Pine Cliffs Ocean Suites' },
      { text: 'Depart Pine Cliffs for Faro, 09:15' },
      { text: 'Rental car drop, 10:00, Faro Airport (FAO) — conf 398444774' },
      { text: 'BA 511 FAO → LHR, departs 12:15; AA 141 LHR → JFK, departs 18:05' },
      { text: 'Arrive JFK 9:05 PM' },
    ],
  },
]
