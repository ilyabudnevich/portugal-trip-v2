// Static trip-prep checklist data for Portugal 2026.
// Plain data only — no logic, no React.
// Each item's `id` must stay stable once set: checked/unchecked state is
// stored in localStorage keyed by group id + item id. Renaming `name` is
// safe; changing `id` will make a previously-checked item look new again.

export const prepGroups = [
  {
    id: 'this-week',
    name: 'This week',
    items: [
      {
        id: 'checked-bags',
        name: 'Checked bags — ba.com (PCQ63) and flytap.com (X73DY6); Basic fares likely exclude bags',
      },
      { id: 'seat-assignments', name: 'Seat assignments — 4 together on both legs' },
      { id: 'passport-check', name: 'Passport check, all four — valid through Dec 2026' },
    ],
  },
  {
    id: 'weeks-2-3',
    name: '2–3 weeks out',
    items: [
      { id: 'oceanario', name: 'Oceanário timed tickets — Aug 30, 10:00' },
      { id: 'pena-palace', name: 'Pena Palace tickets — Aug 31, 09:30 first slot' },
      { id: 'azenhas-lunch', name: 'Azenhas do Mar lunch table — Aug 31' },
      { id: 'nata-class', name: 'Pastel de nata class (optional) — Aug 30 early afternoon' },
      {
        id: 'benagil-boat',
        name: 'Benagil boat — Pine Cliffs concierge or Albufeira marina operator',
      },
      {
        id: 'pine-cliffs-room',
        name: 'Pine Cliffs room request — garden-facing, near elevators, two young children',
      },
    ],
  },
  {
    id: 'week-1',
    name: '1 week out',
    items: [
      { id: 'tide-chart', name: 'Tide chart for Praia da Marinha rock pools' },
      { id: 'dj-lineups', name: 'Check NoSoloÁgua / Purobeach Instagram for DJ lineups' },
      { id: 'checkin-alarms', name: 'Check-in alarms — TAP opens 36h before, BA 24h before' },
      {
        id: 'jncquoi-call',
        name: "Call JNcQUOI Monday afternoon — Resy is 19:45, tell them we'll arrive 20:05",
      },
    ],
  },
]
