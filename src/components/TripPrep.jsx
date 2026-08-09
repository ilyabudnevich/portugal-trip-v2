import {
  addPrepItem,
  deletePrepItem,
  reorderPrepItems,
  setPrepItemChecked,
  setPrepItemName,
} from '../lib/tripData.js'
import Checklist from './Checklist.jsx'

// Behaviour lives in Checklist.jsx; this binds the prep writers and labels.
function TripPrep({ groups, onError, onConfirm }) {
  return (
    <Checklist
      sectionId="trip-prep"
      title="Trip prep"
      checkedLabel="DONE"
      itemNoun="prep item"
      groups={groups}
      onError={onError}
      onConfirm={onConfirm}
      writers={{
        setChecked: setPrepItemChecked,
        addItem: addPrepItem,
        deleteItem: deletePrepItem,
        setName: setPrepItemName,
        reorderItems: reorderPrepItems,
      }}
    />
  )
}

export default TripPrep
