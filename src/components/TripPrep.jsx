import { useState } from 'react'
import { prepGroups } from '../data/prep.js'

const STORAGE_KEY = 'trip-prep-checked-v1'

function itemKey(groupId, itemId) {
  return `${groupId}::${itemId}`
}

function loadCheckedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveCheckedState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage unavailable (private browsing quota, etc.) — ignore
  }
}

function TripPrep() {
  const [checked, setChecked] = useState(() => loadCheckedState())

  function toggleItem(groupId, itemId) {
    setChecked((prev) => {
      const key = itemKey(groupId, itemId)
      const next = { ...prev, [key]: !prev[key] }
      saveCheckedState(next)
      return next
    })
  }

  return (
    <section
      id="trip-prep"
      style={{ padding: '28px 8px', borderTop: '1px solid var(--line)' }}
    >
      <h2>Trip prep</h2>
      <div className="packing-groups">
        {prepGroups.map((group) => (
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
                        {isChecked && <span className="badge badge-booked">DONE</span>}
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

export default TripPrep
