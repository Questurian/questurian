import type { ContentBlock } from '../../types'
import {
  EDITORIAL_PICKER_OPTIONS,
  IMAGE_PICKER_OPTIONS,
} from '../../features/editorial-stage-article/constants'
import type {
  BlockImageModalMode,
  SupportedEditorialComponent,
} from '../../features/editorial-stage-article/types'

type BlockActionZoneProps = {
  block: ContentBlock
  publishedToPayload: boolean
  showFuse?: boolean
  pickerKey?: string
  placeAfterImage?: boolean
  allowImageAdd?: boolean
  openImagePickerTarget: string | null
  openEditorialPickerTarget: string | null
  toggleImagePicker: (target: string) => void
  toggleEditorialPicker: (target: string) => void
  openBlockImageModal: (blockId: string, mode: BlockImageModalMode) => Promise<void> | void
  addEditorialFromPicker: (
    component: SupportedEditorialComponent,
    blockId: string,
    placeAfterImage: boolean
  ) => void
  addNewBlock: (afterBlockId?: string) => void
  mergeWithNextBlock: (blockId: string) => void
}

export function BlockActionZone({
  block,
  publishedToPayload,
  showFuse = true,
  pickerKey,
  placeAfterImage = false,
  allowImageAdd = true,
  openImagePickerTarget,
  openEditorialPickerTarget,
  toggleImagePicker,
  toggleEditorialPicker,
  openBlockImageModal,
  addEditorialFromPicker,
  addNewBlock,
  mergeWithNextBlock,
}: BlockActionZoneProps) {
  if (publishedToPayload) return null
  const resolvedPickerKey = pickerKey || block.id
  const canAddImageAfterBlock = Boolean(block.id)

  return (
    <div className="block-action-zone">
      <div className="block-action-line" />
      <div className="block-action-buttons">
        {showFuse && (
          <button
            type="button"
            className="block-fuse-btn"
            onClick={() => mergeWithNextBlock(block.id)}
            title="Fuse with next block"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 10l5 5 5-5"/>
              <path d="M7 14l5-5 5 5"/>
            </svg>
            Fuse
          </button>
        )}

        {allowImageAdd && canAddImageAfterBlock && (
          <div className="block-editorial-picker">
            <button
              type="button"
              className={`block-add-editorial-trigger ${openImagePickerTarget === resolvedPickerKey ? 'active' : ''}`}
              onClick={() => toggleImagePicker(resolvedPickerKey)}
              title="Choose image block"
            >
              Image
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
            {openImagePickerTarget === resolvedPickerKey && (
              <div className="block-editorial-picker-menu">
                {IMAGE_PICKER_OPTIONS.map((option) => (
                  <button
                    key={`${resolvedPickerKey}-${option.mode}`}
                    type="button"
                    className="block-editorial-option-btn"
                    onClick={() => void openBlockImageModal(block.id, option.mode)}
                  >
                    <span>{option.label}</span>
                    <span className="block-editorial-option-hint">{option.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          className="block-add-block-btn"
          onClick={() => addNewBlock(block.id)}
          title="Add new text block here"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Block
        </button>

        <div className="block-editorial-picker">
          <button
            type="button"
            className={`block-add-editorial-trigger ${openEditorialPickerTarget === resolvedPickerKey ? 'active' : ''}`}
            onClick={() => toggleEditorialPicker(resolvedPickerKey)}
            title="Choose editorial block"
          >
            Editorial
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          {openEditorialPickerTarget === resolvedPickerKey && (
            <div className="block-editorial-picker-menu">
              {EDITORIAL_PICKER_OPTIONS.map((option) => (
                <button
                  key={`${resolvedPickerKey}-${option.component}`}
                  type="button"
                  className="block-editorial-option-btn"
                  onClick={() => addEditorialFromPicker(option.component, block.id, placeAfterImage)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
