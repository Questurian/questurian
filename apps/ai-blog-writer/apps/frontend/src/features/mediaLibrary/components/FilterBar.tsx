import type { Location } from '../../../shared/api/payload/payload.types'
import type { BrowseFilters } from '../types'

type Props = {
  filters: BrowseFilters
  locations: Location[]
  onChange: (filters: BrowseFilters) => void
  onReset: () => void
}

export function FilterBar({ filters, locations, onChange, onReset }: Props) {
  const set = <K extends keyof BrowseFilters>(key: K, value: BrowseFilters[K]) =>
    onChange({ ...filters, [key]: value })

  const hasActiveFilters =
    filters.search ||
    filters.status ||
    filters.locationId !== null ||
    filters.missingField

  return (
    <div className="ml-filter-bar">
      <input
        className="ml-filter-input"
        type="search"
        placeholder="Search by title…"
        value={filters.search}
        onChange={(e) => set('search', e.target.value)}
      />

      <select
        className="ml-filter-select"
        value={filters.status}
        onChange={(e) => set('status', e.target.value)}
      >
        <option value="">All statuses</option>
        <option value="empty">Empty</option>
        <option value="partial">Partial</option>
        <option value="usable">Usable</option>
        <option value="complete">Complete</option>
      </select>

      <select
        className="ml-filter-select"
        value={filters.locationId ?? ''}
        onChange={(e) => set('locationId', e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">All locations</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.neighborhood || l.city || l.country}
          </option>
        ))}
      </select>

      <select
        className="ml-filter-select"
        value={filters.missingField}
        onChange={(e) => set('missingField', e.target.value as BrowseFilters['missingField'])}
      >
        <option value="">All completeness</option>
        <option value="alt_text">Missing alt text</option>
        <option value="photographer_credit">Missing credit</option>
        <option value="location">Missing location</option>
        <option value="title">Missing title</option>
      </select>

      {hasActiveFilters && (
        <button type="button" className="ml-filter-reset" onClick={onReset}>
          Clear
        </button>
      )}
    </div>
  )
}
