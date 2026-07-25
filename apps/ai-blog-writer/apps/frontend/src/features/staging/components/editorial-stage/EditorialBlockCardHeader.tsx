import type { EditorialBlockCardProps } from './editorial-block-card.types'

type EditorialBlockCardHeaderProps = EditorialBlockCardProps & {
  isEditMode: boolean
}

export function EditorialBlockCardHeader({
  block,
  displayNumber,
  options,
  isEditMode,
}: EditorialBlockCardHeaderProps) {
  return (
    <div className="block-card-header">
      <div className="block-card-header-left">
        {options?.canReorder && (
          <div className="block-drag-handle" title="Drag to reorder">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="5" r="1.5"/>
              <circle cx="15" cy="5" r="1.5"/>
              <circle cx="9" cy="12" r="1.5"/>
              <circle cx="15" cy="12" r="1.5"/>
              <circle cx="9" cy="19" r="1.5"/>
              <circle cx="15" cy="19" r="1.5"/>
            </svg>
          </div>
        )}
        {displayNumber > 0 && (
          <span className="block-number" title="Block order">
            {displayNumber}
          </span>
        )}
        <span className="block-type-badge block-type-badge-editorial">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19.5V4a2 2 0 0 1 2-2h9l5 5v12.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 19.5z"/>
            <path d="M14 2v6h6"/>
          </svg>
          Editorial
        </span>
        <strong className="editorial-card-label">{block.label}</strong>
        {isEditMode && (
          <span className="editorial-card-component">{block.component}</span>
        )}
      </div>
      <div className="block-card-header-right">
        {options?.canReorder && (
          <div className="block-move-buttons">
            <button
              type="button"
              className="block-move-btn"
              onClick={options.onMoveUp}
              disabled={options.disableMoveUp}
              title="Move up"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 15l-6-6-6 6"/>
              </svg>
            </button>
            <button
              type="button"
              className="block-move-btn"
              onClick={options.onMoveDown}
              disabled={options.disableMoveDown}
              title="Move down"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
          </div>
        )}
        {options?.onToggleEdit && (
          <button
            type="button"
            className="block-edit-btn"
            onClick={options.onToggleEdit}
            disabled={options.disableEditToggle}
            title={isEditMode ? 'Done editing block' : 'Edit block'}
          >
            {isEditMode ? 'Done' : 'Edit'}
          </button>
        )}
        {options?.onRemoveBlock && (
          <button
            type="button"
            className="block-delete-btn"
            onClick={options.onRemoveBlock}
            disabled={options.disableRemove}
            title="Remove editorial block"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
