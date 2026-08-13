import { LocationPickerResults } from './location-picker/LocationPickerResults'
import { useLocationPicker } from './location-picker/useLocationPicker'

type LocationPickerModalProps = {
  existingLocationIds: number[]
  onSelect: (locationId: number) => Promise<void>
  onClose: () => void
}

export function LocationPickerModal({
  existingLocationIds,
  onSelect,
  onClose,
}: LocationPickerModalProps) {
  const picker = useLocationPicker({
    existingLocationIds,
    onSelect,
    onClose,
  })

  return (
    <div className="hf-modal-backdrop" onClick={onClose}>
      <div
        className="hf-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add Location Homepage"
      >
        <div className="hf-modal-top">
          <div className="hf-modal-title-row">
            <h2>Add Location Homepage</h2>
            <button
              type="button"
              className="hf-modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="hf-modal-search">
            <span className="hf-modal-search-icon">⌕</span>
            <input
              type="search"
              placeholder="Search cities or neighborhoods…"
              value={picker.searchValue}
              onChange={(event) => picker.setSearchValue(event.target.value)}
              autoFocus
            />
          </div>

          {picker.error && <p className="hf-modal-error">{picker.error}</p>}
        </div>

        <div className="hf-modal-body">
          <LocationPickerResults
            groups={picker.groupedLocations}
            isLoading={picker.isLoading}
            totalResults={picker.totalResults}
            searchValue={picker.searchValue}
            isSubmitting={picker.isSubmitting}
            onSelect={(locationId) => void picker.selectLocation(locationId)}
          />
        </div>
      </div>
    </div>
  )
}
