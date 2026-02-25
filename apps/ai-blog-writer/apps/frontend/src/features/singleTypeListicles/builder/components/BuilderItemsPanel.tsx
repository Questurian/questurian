import { MarkdownBlockEditor } from '../../../staging/features/markdown-editor'
import type { ListicleItemBlock, MediaMode, RelatedItemOption, SingleTypeListicleDraft } from '../../types'
import {
  getRelatedInstagramPostIds,
  getRelatedPhotoIds,
  requiresInstagram,
  requiresPhotos,
} from '../utils/item-media.utils'

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
          const availablePhotoIds = getRelatedPhotoIds(selectedRelatedItem)
          const availableInstagramPostIds = getRelatedInstagramPostIds(selectedRelatedItem)
          const photoSelection = item.selectedPhotos.map((value) => String(value))
          const modeNeedsPhotos = requiresPhotos(item.mediaMode)
          const modeNeedsInstagram = requiresInstagram(item.mediaMode)

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

                <label className="stl-field">
                  <span>Related Item *</span>
                  <select
                    value={item.item || ''}
                    onChange={(event) =>
                      updateItem(item.id, (current) => ({
                        ...current,
                        item: event.target.value ? Number(event.target.value) : null,
                        selectedPhotos: [],
                        selectedInstagramPost: null,
                      }))
                    }
                  >
                    <option value="">Select item</option>
                    {relatedItems.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        #{entry.id} {entry.title}
                      </option>
                    ))}
                  </select>
                </label>
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
                <label className="stl-field">
                  <span>Selected Photos * (1-6)</span>
                  <select
                    multiple
                    className="stl-multi-select"
                    value={photoSelection}
                    onChange={(event) => {
                      const nextPhotos = Array.from(event.target.selectedOptions)
                        .map((option) => Number(option.value))
                        .filter((value) => Number.isFinite(value))
                        .slice(0, 6)

                      updateItem(item.id, (current) => ({
                        ...current,
                        selectedPhotos: nextPhotos,
                      }))
                    }}
                  >
                    {availablePhotoIds.map((photoId) => (
                      <option key={photoId} value={photoId}>
                        Media #{photoId}
                      </option>
                    ))}
                  </select>
                  {!selectedRelatedItem ? <p className="stl-legacy-note">Select a related item to choose photos.</p> : null}
                  {selectedRelatedItem && availablePhotoIds.length === 0 ? (
                    <p className="stl-legacy-note">The selected related item has no gallery photos available.</p>
                  ) : null}
                </label>
              ) : null}

              {modeNeedsInstagram ? (
                <label className="stl-field">
                  <span>Selected Instagram Post *</span>
                  <select
                    value={item.selectedInstagramPost || ''}
                    onChange={(event) =>
                      updateItem(item.id, (current) => ({
                        ...current,
                        selectedInstagramPost: event.target.value ? Number(event.target.value) : null,
                      }))
                    }
                  >
                    <option value="">Select Instagram post</option>
                    {availableInstagramPostIds.map((postId) => (
                      <option key={postId} value={postId}>
                        Post #{postId}
                      </option>
                    ))}
                  </select>
                  {!selectedRelatedItem ? (
                    <p className="stl-legacy-note">Select a related item to choose an Instagram post.</p>
                  ) : null}
                  {selectedRelatedItem && availableInstagramPostIds.length === 0 ? (
                    <p className="stl-legacy-note">The selected related item has no Instagram posts available.</p>
                  ) : null}
                </label>
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
            </article>
          )
        })}
      </div>
    </section>
  )
}
