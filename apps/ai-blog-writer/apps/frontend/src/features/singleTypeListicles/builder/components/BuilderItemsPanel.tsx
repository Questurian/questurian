import { useEffect, useState } from 'react'
import { MarkdownBlockEditor } from '../../../staging/features/markdown-editor'
import type { ListicleItemBlock, MediaMode, RelatedItemOption, SingleTypeListicleDraft } from '../../types'
import {
  getRelatedInstagramPostObjects,
  getRelatedPhotoObjects,
  requiresInstagram,
  requiresPhotos,
  resolveImageUrl,
  resolveInstagramPreviewUrl,
} from '../utils/item-media.utils'
import { InstagramPickerModal } from './InstagramPickerModal'
import { PhotoPickerModal } from './PhotoPickerModal'
import { RelatedItemPickerModal } from './RelatedItemPickerModal'

type AiRewriteInput = {
  blockId: string
  currentContent: string
  prompt: string
  includeWholeArticleContext: boolean
}

type BuilderItemsPanelProps = {
  draft: SingleTypeListicleDraft
  relatedItems: RelatedItemOption[]
  isLoadingRelated: boolean
  addItem: () => void
  moveItem: (itemId: string, direction: 'up' | 'down') => void
  removeItem: (itemId: string) => void
  updateItem: (itemId: string, updater: (item: ListicleItemBlock) => ListicleItemBlock) => void
  onItemBlurbAiRewrite: (itemId: string, input: AiRewriteInput) => Promise<string>
}

const MEDIA_MODE_OPTIONS: Array<{ value: MediaMode; label: string }> = [
  { value: 'photos', label: 'Photos' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'both', label: 'Photos + Instagram' },
]

type ActivePicker =
  | { type: 'item'; itemId: string }
  | { type: 'photos'; itemId: string }
  | { type: 'instagram'; itemId: string }
  | null

export function BuilderItemsPanel({
  draft,
  relatedItems,
  isLoadingRelated,
  addItem,
  moveItem,
  removeItem,
  updateItem,
  onItemBlurbAiRewrite,
}: BuilderItemsPanelProps) {
  const blockTypeOptions = draft.listicleType ? [`data-${draft.listicleType}` as ListicleItemBlock['blockType']] : []
  const [activePicker, setActivePicker] = useState<ActivePicker>(null)
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null)
  const [copyErrorItemId, setCopyErrorItemId] = useState<string | null>(null)

  const activeItemPicker = activePicker?.type === 'item' ? activePicker : null
  const activePhotoPicker = activePicker?.type === 'photos' ? activePicker : null
  const activeInstagramPicker = activePicker?.type === 'instagram' ? activePicker : null

  useEffect(() => {
    if (!copiedItemId) return
    const timer = window.setTimeout(() => setCopiedItemId(null), 1800)
    return () => window.clearTimeout(timer)
  }, [copiedItemId])

  const handleCopyRelatedItemTitle = async (itemId: string, title: string) => {
    if (!title.trim()) return
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable')
      }
      await navigator.clipboard.writeText(title)
      setCopiedItemId(itemId)
      setCopyErrorItemId(null)
    } catch {
      setCopiedItemId(null)
      setCopyErrorItemId(itemId)
    }
  }

  return (
    <section className="stl-panel">
      <div className="stl-panel-header">
        <h2>
          <span className="stl-kicker">Step 3</span>
          Items ({draft.items.length}/{draft.targetItemCount})
        </h2>
        <button type="button" className="stl-btn" onClick={addItem} disabled={!draft.listicleType}>
          Add Item
        </button>
      </div>

      {isLoadingRelated ? <p className="stl-placeholder">Loading related items...</p> : null}
      {!isLoadingRelated && draft.listicleType && relatedItems.length === 0 ? (
        <p className="stl-placeholder">No published items found for selected location/type.</p>
      ) : null}

      <div className="stl-list">
        {draft.items.map((item, index) => {
          const selectedRelatedItem = relatedItems.find((entry) => entry.id === item.item) || null
          const photoObjects = getRelatedPhotoObjects(selectedRelatedItem)
          const instagramPostObjects = getRelatedInstagramPostObjects(selectedRelatedItem)
          const modeNeedsPhotos = requiresPhotos(item.mediaMode)
          const modeNeedsInstagram = requiresInstagram(item.mediaMode)
          const selectedInstagramPost = instagramPostObjects.find(
            (p) => p.id === item.selectedInstagramPost,
          ) || null

          const firstItemPhoto = photoObjects[0]
          const firstItemPhotoUrl = firstItemPhoto ? resolveImageUrl(firstItemPhoto) : undefined

          return (
            <article key={item.id} className="stl-item-card">
              <header className="stl-item-header">
                <h3>Item {index + 1}</h3>
                <div className="stl-inline-actions">
                  <button type="button" className="stl-btn stl-btn-secondary" onClick={() => moveItem(item.id, 'up')}>
                    Up
                  </button>
                  <button type="button" className="stl-btn stl-btn-secondary" onClick={() => moveItem(item.id, 'down')}>
                    Down
                  </button>
                  <button type="button" className="stl-btn stl-btn-danger" onClick={() => removeItem(item.id)}>
                    Remove
                  </button>
                </div>
              </header>

              <div className="stl-grid stl-grid-2">
                <label className="stl-field">
                  <span>Block Type *</span>
                  <select
                    value={item.blockType}
                    onChange={(event) =>
                      updateItem(item.id, (current) => ({
                        ...current,
                        blockType: event.target.value as ListicleItemBlock['blockType'],
                      }))
                    }
                  >
                    {blockTypeOptions.map((blockType) => (
                      <option key={blockType} value={blockType}>
                        {blockType}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="stl-field">
                  <span>Related Item *</span>
                  <button
                    type="button"
                    className="stl-picker-trigger"
                    onClick={() => setActivePicker({ type: 'item', itemId: item.id })}
                  >
                    <span className="stl-picker-trigger__preview">
                      {selectedRelatedItem ? (
                        <>
                          {firstItemPhotoUrl && (
                            <img src={firstItemPhotoUrl} alt="" />
                          )}
                          <span className="stl-picker-trigger__label">{selectedRelatedItem.title}</span>
                        </>
                      ) : (
                        <span className="stl-picker-trigger__label stl-picker-trigger__label--placeholder">
                          Select item...
                        </span>
                      )}
                    </span>
                    <span className="stl-picker-trigger__caret">▼</span>
                  </button>
                  {selectedRelatedItem ? (
                    <>
                      <div className="stl-copyable-item-row">
                        <input
                          type="text"
                          className="stl-copyable-item-input"
                          value={selectedRelatedItem.title}
                          readOnly
                          onFocus={(event) => event.currentTarget.select()}
                          onClick={(event) => event.currentTarget.select()}
                          aria-label="Selected related item title"
                        />
                        <button
                          type="button"
                          className={`stl-btn ${copiedItemId === item.id ? 'stl-btn-success' : 'stl-btn-secondary'} stl-copyable-item-btn`}
                          onClick={() => void handleCopyRelatedItemTitle(item.id, selectedRelatedItem.title)}
                        >
                          {copiedItemId === item.id ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      {copyErrorItemId === item.id ? (
                        <p className="stl-legacy-note">Clipboard blocked. Select the text field and press Cmd/Ctrl+C.</p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>

              <div className="stl-grid stl-grid-2">
                <label className="stl-field">
                  <span>Media Mode *</span>
                  <select
                    value={item.mediaMode}
                    onChange={(event) =>
                      updateItem(item.id, (current) => {
                        const nextMode = event.target.value as MediaMode
                        if (nextMode === 'photos') {
                          return { ...current, mediaMode: nextMode, selectedInstagramPost: null }
                        }
                        if (nextMode === 'instagram') {
                          return { ...current, mediaMode: nextMode, selectedPhotos: [] }
                        }
                        return { ...current, mediaMode: nextMode }
                      })
                    }
                  >
                    {MEDIA_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {modeNeedsPhotos ? (
                <div className="stl-field">
                  <span>Selected Photos * (1-6)</span>
                  <button
                    type="button"
                    className="stl-picker-trigger"
                    disabled={!selectedRelatedItem}
                    onClick={() => setActivePicker({ type: 'photos', itemId: item.id })}
                  >
                    <span className="stl-picker-trigger__preview">
                      {item.selectedPhotos.length > 0 ? (
                        <>
                          <span className="stl-picker-trigger__thumbs">
                            {item.selectedPhotos.map((photoId) => {
                              const photo = photoObjects.find((p) => p.id === photoId)
                              const url = photo ? resolveImageUrl(photo) : undefined
                              return url ? (
                                <img key={photoId} src={url} alt="" />
                              ) : (
                                <span key={photoId} className="stl-picker-trigger__thumb-empty" />
                              )
                            })}
                          </span>
                          <span className="stl-picker-trigger__label">
                            {item.selectedPhotos.length} photo{item.selectedPhotos.length !== 1 ? 's' : ''} selected
                          </span>
                        </>
                      ) : (
                        <span className="stl-picker-trigger__label stl-picker-trigger__label--placeholder">
                          Select photos...
                        </span>
                      )}
                    </span>
                    <span className="stl-picker-trigger__caret">▼</span>
                  </button>
                  {!selectedRelatedItem ? (
                    <p className="stl-legacy-note">Select a related item to choose photos.</p>
                  ) : null}
                  {selectedRelatedItem && photoObjects.length === 0 ? (
                    <p className="stl-legacy-note">The selected related item has no gallery photos available.</p>
                  ) : null}
                </div>
              ) : null}

              {modeNeedsInstagram ? (
                <div className="stl-field">
                  <span>Selected Instagram Post *</span>
                  <button
                    type="button"
                    className="stl-picker-trigger"
                    disabled={!selectedRelatedItem}
                    onClick={() => setActivePicker({ type: 'instagram', itemId: item.id })}
                  >
                    <span className="stl-picker-trigger__preview">
                      {selectedInstagramPost ? (
                        <>
                          {resolveInstagramPreviewUrl(selectedInstagramPost) && (
                            <img src={resolveInstagramPreviewUrl(selectedInstagramPost)} alt="" />
                          )}
                          <span className="stl-picker-trigger__label">
                            {selectedInstagramPost.title}
                          </span>
                        </>
                      ) : (
                        <span className="stl-picker-trigger__label stl-picker-trigger__label--placeholder">
                          Select Instagram post...
                        </span>
                      )}
                    </span>
                    <span className="stl-picker-trigger__caret">▼</span>
                  </button>
                  {!selectedRelatedItem ? (
                    <p className="stl-legacy-note">Select a related item to choose an Instagram post.</p>
                  ) : null}
                  {selectedRelatedItem && instagramPostObjects.length === 0 ? (
                    <p className="stl-legacy-note">The selected related item has no Instagram posts available.</p>
                  ) : null}
                </div>
              ) : null}

              <label className="stl-field">
                <span>Blurb *</span>
                <MarkdownBlockEditor
                  blockId={`${item.id}_blurb`}
                  value={item.blurbMarkdown}
                  onChange={(nextValue) =>
                    updateItem(item.id, (current) => ({
                      ...current,
                      blurbMarkdown: nextValue,
                      blurbJsonText: '',
                    }))
                  }
                  showToolbar
                  enforceHeadingStructure={false}
                  onAiRewrite={(input) => onItemBlurbAiRewrite(item.id, input)}
                  placeholder="Write why this item made the list..."
                  className="stl-markdown-textarea"
                  rows={5}
                />
              </label>
              {!item.blurbMarkdown.trim() && item.blurbJsonText?.trim() ? (
                <p className="stl-legacy-note">
                  This blurb currently exists as Lexical JSON in Payload. Editing here will replace it.
                </p>
              ) : null}

              {/* Related item picker modal */}
              <RelatedItemPickerModal
                isOpen={activeItemPicker?.itemId === item.id}
                items={relatedItems}
                selectedItemId={item.item}
                onSelect={(nextId) =>
                  updateItem(item.id, (current) => ({
                    ...current,
                    item: nextId,
                    selectedPhotos: [],
                    selectedInstagramPost: null,
                  }))
                }
                onClose={() => setActivePicker(null)}
              />

              {/* Photo picker modal */}
              <PhotoPickerModal
                isOpen={activePhotoPicker?.itemId === item.id}
                photoObjects={photoObjects}
                selectedPhotoIds={item.selectedPhotos}
                onConfirm={(ids) =>
                  updateItem(item.id, (current) => ({
                    ...current,
                    selectedPhotos: ids,
                  }))
                }
                onClose={() => setActivePicker(null)}
              />

              {/* Instagram picker modal */}
              <InstagramPickerModal
                isOpen={activeInstagramPicker?.itemId === item.id}
                posts={instagramPostObjects}
                selectedPostId={item.selectedInstagramPost}
                onSelect={(nextId) =>
                  updateItem(item.id, (current) => ({
                    ...current,
                    selectedInstagramPost: nextId,
                  }))
                }
                onClose={() => setActivePicker(null)}
              />
            </article>
          )
        })}
      </div>
    </section>
  )
}
