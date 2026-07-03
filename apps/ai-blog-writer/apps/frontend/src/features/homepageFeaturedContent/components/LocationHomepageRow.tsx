import { Link } from 'react-router-dom'

import type { LocationHomepageListItem } from '../locationHomepages'
import {
  formatHomepageDate,
  getLocationHomepagePrimaryLabel,
} from '../locationHomepageList.utils'

type LocationHomepageRowProps = {
  item: LocationHomepageListItem
  isEditMode: boolean
  onRequestDelete: (id: number) => void
  onToggle: (id: number) => void
  isToggling: boolean
}

export function LocationHomepageRow({
  item,
  isEditMode,
  onRequestDelete,
  onToggle,
  isToggling,
}: LocationHomepageRowProps) {
  const label = getLocationHomepagePrimaryLabel(item)

  return (
    <div className={`hf-location-row${isEditMode ? ' is-edit-mode' : ''}`}>
      <div className="hf-location-row-left">
        <span className={`hf-row-dot ${item.isEnabled ? 'on' : 'off'}`} />
        <span className="hf-location-row-name">{label}</span>
        <span className="hf-level-tag">{item.location?.level ?? '?'}</span>
      </div>
      <div className="hf-location-row-right">
        <span className="hf-location-row-date">{formatHomepageDate(item.updatedAt)}</span>
        <button
          type="button"
          className="hf-btn-ghost hf-delete-trigger"
          onClick={() => onToggle(item.id)}
          disabled={isToggling}
          tabIndex={isEditMode ? 0 : -1}
        >
          {isToggling ? 'Updating…' : item.isEnabled ? 'Disable' : 'Enable'}
        </button>
        <Link to={`/homepage-featured-content/${item.id}`} className="hf-btn-ghost">
          Edit
        </Link>
        <button
          type="button"
          className="hf-btn-icon danger hf-delete-trigger"
          title="Delete homepage"
          tabIndex={isEditMode ? 0 : -1}
          onClick={() => onRequestDelete(item.id)}
        >
          ×
        </button>
      </div>
    </div>
  )
}
