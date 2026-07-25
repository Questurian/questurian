import { EDITORIAL_MAX_FAQ_ITEMS, FAQ_LABEL } from '../../features/editorial-stage-article/constants'
import { buildCanonicalFAQMarkdown } from '../../features/editorial-stage-article/editorial-markdown.service'

type FAQItem = {
  question: string
  answer: string
}

type FAQEditorProps = {
  blockId: string
  label: string
  items: FAQItem[]
  onChangeMarkdown: (nextMarkdown: string) => void
}

function ensureMinimumItems(items: FAQItem[]): FAQItem[] {
  return [
    ...items,
    ...Array.from({ length: Math.max(0, 2 - items.length) }, () => ({
      question: '',
      answer: '',
    })),
  ]
}

export function FAQEditor({ blockId, label, items, onChangeMarkdown }: FAQEditorProps) {
  const updateMarkdown = (nextLabel: string, nextItems: FAQItem[]) => {
    onChangeMarkdown(buildCanonicalFAQMarkdown(
      nextLabel,
      nextItems,
      { useFallbackItems: false },
    ))
  }

  return (
    <>
      <div className="editorial-field-group">
        <div className="editorial-field-row">
          <label className="editorial-field-label">Label</label>
          <span className="editorial-field-meta">
            {items.filter((item) => item.question.trim() && item.answer.trim()).length}
            {' / '}
            {EDITORIAL_MAX_FAQ_ITEMS}
          </span>
        </div>
        <input
          type="text"
          className="editorial-field-input"
          value={label}
          onChange={(event) => updateMarkdown(event.target.value, items)}
          placeholder={FAQ_LABEL}
        />
      </div>

      <div className="editorial-field-group">
        <label className="editorial-field-label">Questions and Answers</label>
        <div className="editorial-takeaway-list">
          {items.map((item, itemIndex) => (
            <div key={`${blockId}_faq_${itemIndex}`} className="editorial-field-group">
              <div className="editorial-field-row">
                <span className="editorial-field-meta">FAQ {itemIndex + 1}</span>
                <button
                  type="button"
                  className="editorial-inline-btn danger"
                  onClick={() => updateMarkdown(
                    label,
                    ensureMinimumItems(items.filter((_, index) => index !== itemIndex)),
                  )}
                  disabled={items.length <= 2}
                  title="Remove FAQ item"
                >
                  Remove
                </button>
              </div>
              <input
                type="text"
                className="editorial-field-input"
                value={item.question}
                onChange={(event) => {
                  const nextItems = [...items]
                  nextItems[itemIndex] = { ...nextItems[itemIndex], question: event.target.value }
                  updateMarkdown(label, nextItems)
                }}
                placeholder="Question"
              />
              <textarea
                className="editorial-field-textarea"
                value={item.answer}
                onChange={(event) => {
                  const nextItems = [...items]
                  nextItems[itemIndex] = { ...nextItems[itemIndex], answer: event.target.value }
                  updateMarkdown(label, nextItems)
                }}
                rows={3}
                placeholder="Answer"
              />
            </div>
          ))}
        </div>
        <div className="editorial-field-actions">
          <button
            type="button"
            className="editorial-inline-btn"
            onClick={() => updateMarkdown(label, [...items, { question: '', answer: '' }])}
            disabled={items.length >= EDITORIAL_MAX_FAQ_ITEMS}
          >
            Add FAQ item
          </button>
        </div>
      </div>
    </>
  )
}
