import { EDITORIAL_MAX_TAKEAWAYS, KEY_TAKEAWAYS_LABEL } from '../../features/editorial-stage-article/constants'
import { buildCanonicalKeyTakeawaysMarkdown } from '../../features/editorial-stage-article/editorial-markdown.service'

type KeyTakeawaysEditorProps = {
  blockId: string
  label: string
  items: string[]
  onChangeMarkdown: (nextMarkdown: string) => void
}

export function KeyTakeawaysEditor({
  blockId,
  label,
  items,
  onChangeMarkdown,
}: KeyTakeawaysEditorProps) {
  const updateMarkdown = (nextLabel: string, nextItems: string[]) => {
    onChangeMarkdown(buildCanonicalKeyTakeawaysMarkdown(
      nextLabel,
      nextItems,
      { useFallbackItems: false },
    ))
  }

  return (
    <>
      <div className="editorial-field-group">
        <label className="editorial-field-label">Label</label>
        <input
          type="text"
          className="editorial-field-input"
          value={label}
          onChange={(event) => updateMarkdown(event.target.value, items)}
          placeholder={KEY_TAKEAWAYS_LABEL}
        />
      </div>

      <div className="editorial-field-group">
        <div className="editorial-field-row">
          <label className="editorial-field-label">Takeaways</label>
          <span className="editorial-field-meta">
            {items.filter((item) => item.trim().length > 0).length}
            {' / '}
            {EDITORIAL_MAX_TAKEAWAYS}
          </span>
        </div>
        <div className="editorial-takeaway-list">
          {items.map((item, itemIndex) => (
            <div key={`${blockId}_takeaway_${itemIndex}`} className="editorial-takeaway-row">
              <span className="editorial-takeaway-index">{itemIndex + 1}</span>
              <input
                type="text"
                className="editorial-field-input"
                value={item}
                onChange={(event) => {
                  const nextItems = [...items]
                  nextItems[itemIndex] = event.target.value
                  updateMarkdown(label, nextItems)
                }}
                placeholder={`Takeaway ${itemIndex + 1}`}
              />
              <button
                type="button"
                className="editorial-inline-btn danger"
                onClick={() => {
                  const nextItems = items.filter((_, index) => index !== itemIndex)
                  updateMarkdown(label, nextItems.length ? nextItems : [''])
                }}
                disabled={items.length <= 1}
                title="Remove takeaway"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="editorial-field-actions">
          <button
            type="button"
            className="editorial-inline-btn"
            onClick={() => updateMarkdown(label, [...items, ''])}
            disabled={items.length >= EDITORIAL_MAX_TAKEAWAYS}
          >
            Add takeaway
          </button>
        </div>
      </div>
    </>
  )
}
