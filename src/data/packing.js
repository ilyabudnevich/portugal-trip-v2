// Static packing-list data for Portugal 2026.
// Plain data only — no logic, no React.
// Each item's `id` must stay stable once set: checked/unchecked state is
// stored in localStorage keyed by group id + item id. Renaming `name` is
// safe; changing `id` will make a previously-checked item look new again.

export const packingGroups = [
  {
    id: 'ilya',
    name: 'Ilya',
    items: [
      { id: 'passport', name: 'Passport' },
      { id: 'jeans', name: 'Jeans' },
      { id: 'shorts', name: 'Shorts' },
      { id: 'sneakers', name: 'Sneakers' },
      { id: 'swim-shorts', name: 'Swim shorts' },
    ],
  },
  { id: 'elina', name: 'Elina', items: [] },
  { id: 'kids', name: 'Kids', items: [] },
]
