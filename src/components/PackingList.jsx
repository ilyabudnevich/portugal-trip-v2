import {
  addPackingItem,
  deletePackingItem,
  reorderPackingItems,
  setPackingItemChecked,
  setPackingItemName,
} from '../lib/tripData.js'
import Checklist from './Checklist.jsx'

// Behaviour lives in Checklist.jsx; this binds the packing writers and labels.
function PackingList({ groups, onError, onConfirm }) {
  return (
    <Checklist
      sectionId="packing-list"
      title="Packing list"
      checkedLabel="PACKED"
      itemNoun="packing item"
      groups={groups}
      onError={onError}
      onConfirm={onConfirm}
      writers={{
        setChecked: setPackingItemChecked,
        addItem: addPackingItem,
        deleteItem: deletePackingItem,
        setName: setPackingItemName,
        reorderItems: reorderPackingItems,
      }}
    />
  )
}

export default PackingList
