import { useEffect, useState } from 'react'
import {
  addPackingItem,
  deletePackingItem,
  setPackingItemChecked,
} from '../lib/tripData.js'

// The three helpers below keep group/item updates immutable. They are duplicated
// in TripPrep.jsx; a shared hook is the obvious next refactor.
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

function PackingList({ groups, onError, onConfirm }) {
  const [groupList, setGroupList] = useState(() => groups)
  const [addingGroupId, setAddingGroupId] = useState(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  // App refetches when the phone returns to the foreground, so adopt the fresh
  // rows. This does overwrite an optimistic flip still awaiting its write —
  // rare, and the server copy is the one to trust.
  useEffect(() => {
    setGroupList(groups)
  }, [groups])

  // Optimistic: flip now, write, put it back if the write fails.
  async function toggleItem(groupId, item) {
    const next = !item.checked

    setGroupList((prev) => withItemPatch(prev, groupId, item.id, { checked: next }))
    onError(null)

    try {
      await setPackingItemChecked(groupId, item.id, next)
    } catch (err) {
      setGroupList((prev) =>
        withItemPatch(prev, groupId, item.id, { checked: item.checked }),
      )
      onError(err.message)
    }
  }

  // Add and delete are not optimistic — the write lands first, then the UI.
  async function removeItem(groupId, item) {
    if (!onConfirm(`Delete '${item.name}'?`)) return
    onError(null)

    try {
      await deletePackingItem(groupId, item.id)
      setGroupList((prev) => withItemRemoved(prev, groupId, item.id))
    } catch (err) {
      onError(err.message)
    }
  }

  async function saveNewItem(group, closeAfter = false) {
    const name = draft.trim()
    if (!name || saving) return

    setSaving(true)
    onError(null)

    try {
      const sortOrder = Math.max(0, ...group.items.map((i) => i.sort_order)) + 1
      const created = await addPackingItem(group.id, name, sortOrder)
      setGroupList((prev) => withItemAppended(prev, group.id, created))
      setDraft('') // input stays open and focused for the next entry
      if (closeAfter) setAddingGroupId(null)
    } catch (err) {
      onError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function cancelAdd() {
    setAddingGroupId(null)
    setDraft('')
  }

  return (
    <section id="packing-list">
      <h2>Packing list</h2>
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
                      {item.checked && <span className="badge badge-booked">PACKED</span>}
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
                  aria-label={`New packing item for ${group.name}`}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveNewItem(group)
                    if (e.key === 'Escape') cancelAdd()
                  }}
                  onBlur={() => {
                    if (draft.trim()) saveNewItem(group, true)
                    else cancelAdd()
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

export default PackingList
