import type { ReactNode } from 'react'
import type { ImagePickerQuery, ImagePickerTab } from './imagePicker.types'

type ImagePickerChromeProps = {
  activeTab: ImagePickerTab
  payloadOnly: boolean
  uploadAvailable: boolean
  locationRef: number | null
  query: ImagePickerQuery
  children: ReactNode
  onTabChange: (tab: ImagePickerTab) => void
  onClose: () => void
}

const tabTitles: Record<ImagePickerTab, string> = {
  payload: 'Select from Payload Library',
  upload: 'Upload Image',
  unsplash: 'Search Unsplash',
  pexels: 'Search Pexels',
}

export function ImagePickerChrome({
  activeTab,
  payloadOnly,
  uploadAvailable,
  locationRef,
  query,
  children,
  onTabChange,
  onClose,
}: ImagePickerChromeProps) {
  return (
    <div
      className="ip-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Image picker"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="ip-modal__header">
        <h3>{tabTitles[activeTab]}</h3>
        <button
          type="button"
          className="ip-modal__close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="ip-tabs">
        <TabButton
          label="Payload Library"
          isActive={activeTab === 'payload'}
          onClick={() => onTabChange('payload')}
        />
        {!payloadOnly ? (
          <>
            <TabButton
              label="Upload"
              isActive={activeTab === 'upload'}
              onClick={() => onTabChange('upload')}
              disabled={!uploadAvailable || locationRef === null}
              title={
                !uploadAvailable
                  ? 'Upload is available for single-image selection only.'
                  : locationRef === null
                    ? 'Set a location to enable uploads.'
                    : undefined
              }
            />
            <TabButton
              label="Unsplash"
              isActive={activeTab === 'unsplash'}
              onClick={() => onTabChange('unsplash')}
            />
            <TabButton
              label="Pexels"
              isActive={activeTab === 'pexels'}
              onClick={() => onTabChange('pexels')}
            />
          </>
        ) : null}
      </div>

      {query.requirementLabel && activeTab === 'payload' && (
        <div className="ip-context-bar">
          <span className="ip-context-chip">
            {query.browseUnit === 'mediaSets' ? 'Media Set' : 'Image'}
          </span>
          <div className="ip-context-copy">
            <span className="ip-context-label">Requirement</span>
            <strong className="ip-context-value">{query.requirementLabel}</strong>
          </div>
        </div>
      )}

      <div className="ip-body">{children}</div>
    </div>
  )
}

function TabButton({
  label,
  isActive,
  ...buttonProps
}: {
  label: string
  isActive: boolean
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      className={`ip-tab${isActive ? ' ip-tab--active' : ''}`}
      {...buttonProps}
    >
      {label}
    </button>
  )
}
