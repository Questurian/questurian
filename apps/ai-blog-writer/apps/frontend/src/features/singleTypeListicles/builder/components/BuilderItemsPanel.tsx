import { MarkdownBlockEditor } from '../../../staging/features/markdown-editor'
import type { ListicleItemBlock, SingleTypeListicleDraft } from '../../types'

type BuilderItemsPanelProps = {
  draft: SingleTypeListicleDraft
  relatedItems: Array<{ id: number; title: string }>
  isLoadingRelated: boolean
  addItem: () => void
  moveItem: (itemId: string, direction: 'up' | 'down') => void
  removeItem: (itemId: string) => void
  updateItem: (itemId: string, updater: (item: ListicleItemBlock) => ListicleItemBlock) => void
}

export function BuilderItemsPanel({
  draft,
  relatedItems,
  isLoadingRelated,
  addItem,
  moveItem,
  removeItem,
  updateItem,
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
        {draft.items.map((item, index) => (
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
        ))}
      </div>
    </section>
  )
}
