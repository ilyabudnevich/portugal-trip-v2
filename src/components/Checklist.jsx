import { useEffect, useRef, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { stageDelete } from '../lib/tripData.js'

// The packing list and the trip-prep checklist were byte-identical apart from
// labels and which writers they imported. This holds the behaviour once; the two
// wrappers supply the labels and the writers.

// The three helpers below keep group/item updates immutable.
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

function withItemsReplaced(groupList, groupId, items) {
  return groupList.map((group) =>
    group.id === groupId ? { ...group, items } : group,
  )
}

// One tap-to-edit label. Escape stops propagation so it reverts this edit rather
// than reaching the window handler that leaves the mode.
function EditableText({ value, label, isEditing, edit }) {
  if (isEditing) {
    return (
      <input
        className="add-input"
        autoFocus
        value={edit.draft}
        aria-label={label}
        onChange={(e) => edit.change(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') edit.commit()
          if (e.key === 'Escape') {
            e.stopPropagation()
            edit.cancel()
          }
        }}
        onBlur={() => edit.commit()}
      />
    )
  }

  return (
    <button type="button" className="edit-text" onClick={edit.begin}>
      {value}
    </button>
  )
}

// One item while its group is being edited: an optional drag handle, the
// renamable name, and the × that deletes it. Checking is deliberately absent —
// the group should read as editing, not acting — and deleting lives here rather
// than in the browse row, so a list being read has nothing sharp in it.
function SortableChecklistRow({ item, showHandle, edit, onDelete }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  return (
    <li
      ref={setNodeRef}
      className={`event-row-arranging ${isDragging ? 'is-dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {/* dnd-kit's listeners only ever land on this button, so not rendering it
          is what makes a one-item group undraggable — no separate guard. */}
      {showHandle && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="event-handle"
          aria-label={`Reorder ${item.name}`}
          {...attributes}
          {...listeners}
        >
          ≡
        </button>
      )}
      <div className="arranging-body">
        <EditableText
          value={item.name}
          label={`Rename: ${item.name}`}
          isEditing={edit.target === item.id}
          edit={edit}
        />
      </div>
      <button
        type="button"
        className="row-delete"
        aria-label={`Delete ${item.name}`}
        onClick={onDelete}
      >
        ×
      </button>
    </li>
  )
}

function Checklist({
  sectionId,
  title,
  itemNoun,
  groups,
  onError,
  writers,
}) {
  const [groupList, setGroupList] = useState(() => groups)
  const [addingGroupId, setAddingGroupId] = useState(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  // Edit mode. A single value, which makes "one group at a time" structural.
  const [editGroupId, setEditGroupId] = useState(null)
  const [arrangeItems, setArrangeItems] = useState([])
  const draggingRef = useRef(false)
  const [editing, setEditing] = useState(null)
  const [editDraft, setEditDraft] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const editingRef = useRef(null)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  // App refetches when the phone returns to the foreground, so adopt the fresh
  // rows. This does overwrite an optimistic flip still awaiting its write —
  // rare, and the server copy is the one to trust.
  useEffect(() => {
    setGroupList(groups)
  }, [groups])

  // Escape is three-deep: dnd-kit cancels an in-flight drag, an open rename
  // reverts itself, and only then does Escape leave the mode. It never commits.
  useEffect(() => {
    if (editGroupId === null) return
    function onKeyDown(e) {
      if (e.key !== 'Escape') return
      if (draggingRef.current || editingRef.current !== null) return
      setEditGroupId(null)
      setArrangeItems([])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editGroupId])

  // Optimistic: flip now, write, put it back if the write fails.
  async function toggleItem(groupId, item) {
    const next = !item.checked

    setGroupList((prev) => withItemPatch(prev, groupId, item.id, { checked: next }))
    onError(null)

    try {
      await writers.setChecked(groupId, item.id, next)
    } catch (err) {
      setGroupList((prev) =>
        withItemPatch(prev, groupId, item.id, { checked: item.checked }),
      )
      onError(err.message)
    }
  }

  // Deletes are staged (see stageDelete): the row leaves the screen now, the
  // write fires when the undo window closes, and Undo splices the captured item
  // back at its captured index — name, checked state and sort_order all ride on
  // the object — without any write.
  //
  // Only reachable from inside Edit mode, so arrangeItems — the array the
  // editing branch renders and the one commitEdit diffs for sort_orders — drops
  // and restores the row too. The restore leaves it alone once the mode has
  // been exited and the array emptied.
  function removeItem(groupId, item) {
    const group = groupList.find((g) => g.id === groupId)
    const index = group ? group.items.findIndex((i) => i.id === item.id) : -1
    if (index < 0) return
    const arrangeIndex = arrangeItems.findIndex((i) => i.id === item.id)

    setGroupList((prev) => withItemRemoved(prev, groupId, item.id))
    setArrangeItems((prev) => prev.filter((i) => i.id !== item.id))
    onError(null)

    stageDelete({
      label: `Deleted '${item.name}'`,
      commit: () => writers.deleteItem(groupId, item.id),
      restore: () => {
        setGroupList((prev) =>
          prev.map((g) => {
            if (g.id !== groupId) return g
            const items = [...g.items]
            items.splice(Math.min(index, items.length), 0, item)
            return { ...g, items }
          }),
        )
        setArrangeItems((prev) => {
          if (prev.length === 0 || arrangeIndex < 0) return prev
          const next = [...prev]
          next.splice(Math.min(arrangeIndex, next.length), 0, item)
          return next
        })
      },
      onError,
    })
  }

  async function saveNewItem(group, closeAfter = false) {
    const name = draft.trim()
    if (!name || saving) return

    setSaving(true)
    onError(null)

    try {
      const sortOrder = Math.max(0, ...group.items.map((i) => i.sort_order)) + 1
      const created = await writers.addItem(group.id, name, sortOrder)
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

  function enterEdit(group) {
    cancelAdd()
    setEditGroupId(group.id)
    setArrangeItems(group.items)
  }

  function exitEdit() {
    closeEdit()
    setEditGroupId(null)
    setArrangeItems([])
  }

  function beginEdit(itemId, currentName) {
    editingRef.current = itemId
    setEditing(itemId)
    setEditDraft(currentName)
  }

  function closeEdit() {
    editingRef.current = null
    setEditing(null)
    setEditDraft('')
  }

  function handleDragEnd({ active, over }) {
    draggingRef.current = false
    if (!over || active.id === over.id) return

    setArrangeItems((prev) => {
      const from = prev.findIndex((i) => i.id === active.id)
      const to = prev.findIndex((i) => i.id === over.id)
      if (from < 0 || to < 0) return prev
      return arrayMove(prev, from, to)
    })
  }

  // Renames land in both places: arrangeItems is what the editing branch
  // renders, groupList is what survives leaving the mode.
  function patchItemEverywhere(groupId, itemId, patch) {
    setGroupList((prev) => withItemPatch(prev, groupId, itemId, patch))
    setArrangeItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
    )
  }

  async function commitEdit() {
    const itemId = editingRef.current
    if (itemId === null || editSaving) return

    const name = editDraft.trim()
    const groupId = editGroupId
    const item = arrangeItems.find((i) => i.id === itemId)

    // Clearing the ref first is what makes the blur after Enter a no-op.
    closeEdit()

    // Empty is rejected, and identical text is not a rename.
    if (!item || !name || name === item.name) return

    setEditSaving(true)
    onError(null)

    try {
      const saved = await writers.setName(groupId, itemId, name)
      patchItemEverywhere(groupId, itemId, { name: saved })
    } catch (err) {
      onError(err.message)
    } finally {
      setEditSaving(false)
    }
  }

  async function commitOrder() {
    const groupId = editGroupId
    const ordered = arrangeItems
    const serverItems = groups.find((g) => g.id === groupId)?.items ?? []
    const unchanged =
      ordered.length === serverItems.length &&
      ordered.every((item, i) => item.id === serverItems[i].id)

    exitEdit()
    if (unchanged) return // nothing moved, so nothing to write

    onError(null)
    setGroupList((prev) =>
      withItemsReplaced(
        prev,
        groupId,
        ordered.map((item, i) => ({ ...item, sort_order: i + 1 })),
      ),
    )

    try {
      await writers.reorderItems(groupId, ordered)
    } catch (err) {
      onError(err.message)
      // Revert the order only, by re-sorting the current items into the last
      // server order. Item objects are kept, so a rename that did land is not
      // clobbered.
      setGroupList((prev) =>
        prev.map((group) => {
          if (group.id !== groupId) return group
          const rank = new Map(serverItems.map((item, i) => [item.id, i]))
          const items = [...group.items].sort(
            (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0),
          )
          return { ...group, items }
        }),
      )
    }
  }

  const edit = {
    draft: editDraft,
    change: setEditDraft,
    commit: commitEdit,
    cancel: closeEdit,
  }

  return (
    <section id={sectionId}>
      <h2>{title}</h2>
      <div className="packing-groups">
        {groupList.map((group) => {
          const isEditing = editGroupId === group.id

          return (
            <div
              className={`packing-group ${isEditing ? 'group-reordering' : ''}`}
              key={group.id}
            >
              <h3>
                {group.name}
                {isEditing ? (
                  <button type="button" className="day-tool" onClick={commitOrder}>
                    Done
                  </button>
                ) : (
                  // Hidden on every other group while one is being edited, so a
                  // stray tap cannot discard an uncommitted arrangement. A
                  // one-item group has nothing to arrange but is still renamable.
                  editGroupId === null &&
                  group.items.length > 0 && (
                    <button
                      type="button"
                      className="day-tool"
                      onClick={() => enterEdit(group)}
                    >
                      Edit
                    </button>
                  )
                )}
              </h3>

              {isEditing ? (
                // Only this group's items are inside the SortableContext, so
                // there is no droppable target in another group — the
                // no-cross-group rule is structural, not a runtime check.
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={() => {
                    draggingRef.current = true
                  }}
                  onDragCancel={() => {
                    draggingRef.current = false
                  }}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={arrangeItems.map((item) => item.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul className="packing-items">
                      {arrangeItems.map((item) => (
                        <SortableChecklistRow
                          key={item.id}
                          item={item}
                          showHandle={arrangeItems.length > 1}
                          onDelete={() => removeItem(group.id, item)}
                          edit={{
                            ...edit,
                            target: editing,
                            begin: () => beginEdit(item.id, item.name),
                          }}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              ) : (
                <>
                  {group.items.length === 0 ? (
                    <p className="packing-empty">Nothing added yet</p>
                  ) : (
                    <ul className="packing-items">
                      {group.items.map((item) => (
                        <li className="packing-row" key={item.id}>
                          {/* aria-pressed already announces the state, so the
                              check and the strike-through are free to be purely
                              visual — which is why the badge that used to
                              restate them is gone. */}
                          <button
                            type="button"
                            className="packing-item"
                            aria-pressed={item.checked}
                            onClick={() => toggleItem(group.id, item)}
                          >
                            <span
                              className={item.checked ? 'ev-check on' : 'ev-check'}
                              aria-hidden="true"
                            >
                              {item.checked ? '✓' : ''}
                            </span>
                            <span className={item.checked ? 'packing-item-name checked' : 'packing-item-name'}>
                              {item.name}
                            </span>
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
                        aria-label={`New ${itemNoun} for ${group.name}`}
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
                </>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default Checklist
