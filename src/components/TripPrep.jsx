import { useState } from 'react'
import {
  addPrepItem,
  deletePrepItem,
  setPrepItemChecked,
} from '../lib/tripData.js'

// The three helpers below keep group/item updates immutable. They are duplicated
// in PackingList.jsx; a shared hook is the obvious next refactor.
function withItemPatch(groupList, groupId, itemId, patch) {
  return groupList.map((group) =>
    group.id !== groupId
      ? group
      : {
          ...group,
          items: group.items.map((item) =>
            item.id === itemId ? { ...item, ...patch } : item,
          ),
        },
  )
}

function withItemRemoved(groupList, groupId, itemId) {
  return groupList.map((group) =>
    group.id !== groupId
      ? group
      : { ...group, items: group.items.filter((item) => item.id !== itemId) },
  )
}

function withItemAppended(groupList, groupId, item) {
  return groupList.map((group) =>
    group.id !== groupId ? group : { ...group, items: [...group.items, item] },
  )
}

function TripPrep({ groups }) {
  // Safe to seed from a prop: App renders this only after the fetch resolves and
  // never refetches, so `groups` never changes identity underneath us.
  const [groupList, setGroupList] = useState(() => groups)
  const [error, setError] = useState(null)
  const [addingGroupId, setAddingGroupId] = useState(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  // Optimistic: flip now, write, put it back if the write fails.
  async function toggleItem(groupId, item) {
    const next = !item.checked

    setGroupList((prev) => withItemPatch(prev, groupId, item.id, { checked: next }))
    setError(null)

    try {
      await setPrepItemChecked(groupId, item.id, next)
    } catch (err) {
      setGroupList((prev) =>
        withItemPatch(prev, groupId, item.id, { checked: item.checked }),
      )
      setError(err.message)
    }
  }

  // Add and delete are not optimistic — the write lands first, then the UI.
  async function removeItem(groupId, item) {
    if (!window.confirm(`Delete '${item.name}'?`)) return
    setError(null)

    try {
      await deletePrepItem(groupId, item.id)
      setGroupList((prev) => withItemRemoved(prev, groupId, item.id))
    } catch (err) {
      setError(err.message)
    }
  }

  async function saveNewItem(group) {
    const name = draft.trim()
    if (!name || saving) return

    setSaving(true)
    setError(null)

    try {
      const sortOrder = Math.max(0, ...group.items.map((i) => i.sort_order)) + 1
      const created = await addPrepItem(group.id, name, sortOrder)
      setGroupList((prev) => withItemAppended(prev, group.id, created))
      setDraft('') // input stays open and focused for the next entry
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function cancelAdd() {
    setAddingGroupId(null)
    setDraft('')
  }

  return (
    <section
      id="trip-prep"
      style={{ padding: '28px 8px', borderTop: '1px solid var(--line)' }}
    >
      <h2>Trip prep</h2>
      {error && <p>Could not save: {error}</p>}
      <div className="packing-groups">
        {groupList.map((group) => (
          <div className="packing-group" key={group.id}>
            <h3>{group.name}</h3>
            {group.items.length === 0 ? (
              <p className="packing-empty">Nothing added yet</p>
            ) : (
              <ul className="packing-items">
                {group.items.map((item) => (
                  <li className="packing-row" key={item.id}>
                    <button
                      type="button"
                      className="packing-item"
                      aria-pressed={item.checked}
                      onClick={() => toggleItem(group.id, item)}
                    >
                      <span className={item.checked ? 'packing-item-name checked' : 'packing-item-name'}>
                        {item.name}
                      </span>
                      {item.checked && <span className="badge badge-booked">DONE</span>}
                    </button>
                    <button
                      type="button"
                      className="row-delete"
                      aria-label={`Delete ${item.name}`}
                      onClick={() => removeItem(group.id, item)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="add-row">
              {addingGroupId === group.id ? (
                <input
                  className="add-input"
                  autoFocus
                  value={draft}
                  placeholder="New item"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveNewItem(group)
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
                    setAddingGroupId(group.id)
                    setDraft('')
                  }}
                >
                  + Add
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default TripPrep
