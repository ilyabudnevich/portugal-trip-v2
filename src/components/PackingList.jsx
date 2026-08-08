import { useState } from 'react'
import { setPackingItemChecked } from '../lib/tripData.js'

// Item ids are only unique within a group, so the state map is keyed by both.
function itemKey(groupId, itemId) {
  return `${groupId}::${itemId}`
}

function initialChecked(groups) {
  return Object.fromEntries(
    groups.flatMap((group) =>
      group.items.map((item) => [itemKey(group.id, item.id), item.checked]),
    ),
  )
}

function PackingList({ groups }) {
  // Safe to seed from a prop: App renders this only after the fetch resolves and
  // never refetches, so `groups` never changes identity underneath us.
  const [checked, setChecked] = useState(() => initialChecked(groups))
  const [error, setError] = useState(null)

  // Optimistic: flip now, write, and put it back if the write fails.
  async function toggleItem(groupId, itemId) {
    const key = itemKey(groupId, itemId)
    const next = !checked[key]

    setChecked((prev) => ({ ...prev, [key]: next }))
    setError(null)

    try {
      await setPackingItemChecked(groupId, itemId, next)
    } catch (err) {
      setChecked((prev) => ({ ...prev, [key]: !next }))
      setError(err.message)
    }
  }

  return (
    <section id="packing-list">
      <h2>Packing list</h2>
      {error && <p>Could not save: {error}</p>}
      <div className="packing-groups">
        {groups.map((group) => (
          <div className="packing-group" key={group.id}>
            <h3>{group.name}</h3>
            {group.items.length === 0 ? (
              <p className="packing-empty">Nothing added yet</p>
            ) : (
              <ul className="packing-items">
                {group.items.map((item) => {
                  const isChecked = Boolean(checked[itemKey(group.id, item.id)])
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="packing-item"
                        aria-pressed={isChecked}
                        onClick={() => toggleItem(group.id, item.id)}
                      >
                        <span className={isChecked ? 'packing-item-name checked' : 'packing-item-name'}>
                          {item.name}
                        </span>
                        {isChecked && <span className="badge badge-booked">PACKED</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

export default PackingList
