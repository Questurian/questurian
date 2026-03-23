import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { EditorialBlock } from '../../types'
import {
  EDITORIAL_MAX_FAQ_ITEMS,
  EDITORIAL_MAX_TAKEAWAYS,
  FAQ_COMPONENT,
  FAQ_LABEL,
  HIGHLIGHT_CALLOUT_COMPONENT,
  HIGHLIGHT_CALLOUT_LABEL,
  IN_THE_KNOW_COMPONENT,
  IN_THE_KNOW_LABEL,
  KEY_TAKEAWAYS_COMPONENT,
  KEY_TAKEAWAYS_LABEL,
  PULL_QUOTE_COMPONENT,
  PULL_QUOTE_LABEL,
} from '../../features/editorial-stage-article/constants'
import {
  buildCanonicalFAQMarkdown,
  buildCanonicalHighlightCalloutMarkdown,
  buildCanonicalInTheKnowMarkdown,
  buildCanonicalKeyTakeawaysMarkdown,
  buildCanonicalPullQuoteMarkdown,
  getEditorialBlockBody,
  normalizeEditorialComponentKey,
  parseFAQEditorialBlock,
  parseHighlightCalloutEditorialBlock,
  parseInTheKnowEditorialBlock,
  parseKeyTakeawayEditorialBlock,
  parsePullQuoteEditorialBlock,
} from '../../features/editorial-stage-article/editorial-markdown.service'
import type { EditorialPublishValidation } from '../../features/editorial-stage-article/editorial-markdown.service'

function resizeTextareaToContent(element: HTMLTextAreaElement): void {
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

export function renderEditorialBlockCard(
  block: EditorialBlock,
  displayNumber: number,
  options?: {
    validation?: EditorialPublishValidation
    onFixBlock?: () => void
    disableFix?: boolean
    canEdit?: boolean
    onToggleEdit?: () => void
    disableEditToggle?: boolean
    onChangeMarkdown?: (nextMarkdown: string) => void
    onRemoveBlock?: () => void
    disableRemove?: boolean
    canReorder?: boolean
    onMoveUp?: () => void
    onMoveDown?: () => void
    disableMoveUp?: boolean
    disableMoveDown?: boolean
  }
) {
  const previewMarkdown = getEditorialBlockBody(block.markdown)
  const validation = options?.validation
  const normalizedComponent = normalizeEditorialComponentKey(block.component)
  const keyTakeawaysParsed = normalizedComponent === KEY_TAKEAWAYS_COMPONENT
    ? parseKeyTakeawayEditorialBlock(block)
    : null
  const pullQuoteParsed = normalizedComponent === PULL_QUOTE_COMPONENT
    ? parsePullQuoteEditorialBlock(block)
    : null
  const inTheKnowParsed = normalizedComponent === IN_THE_KNOW_COMPONENT
    ? parseInTheKnowEditorialBlock(block)
    : null
  const highlightCalloutParsed = normalizedComponent === HIGHLIGHT_CALLOUT_COMPONENT
    ? parseHighlightCalloutEditorialBlock(block)
    : null
  const faqParsed = normalizedComponent === FAQ_COMPONENT
    ? parseFAQEditorialBlock(block)
    : null
  const isKeyTakeaways = normalizedComponent === KEY_TAKEAWAYS_COMPONENT
  const isPullQuote = normalizedComponent === PULL_QUOTE_COMPONENT
  const isInTheKnow = normalizedComponent === IN_THE_KNOW_COMPONENT
  const isHighlightCallout = normalizedComponent === HIGHLIGHT_CALLOUT_COMPONENT
  const isFAQ = normalizedComponent === FAQ_COMPONENT
  const supportsStructuredEditor =
    isKeyTakeaways
    || isPullQuote
    || isInTheKnow
    || isHighlightCallout
    || isFAQ
  const isEditMode = Boolean(options?.canEdit && options?.onChangeMarkdown)
  const keyTakeawaysLabel = keyTakeawaysParsed?.label || block.label || KEY_TAKEAWAYS_LABEL
  const keyTakeawaysDraftItems = keyTakeawaysParsed?.rawItems.length
    ? keyTakeawaysParsed.rawItems
    : ['']
  const pullQuoteLabel = pullQuoteParsed?.label || block.label || PULL_QUOTE_LABEL
  const pullQuoteText = pullQuoteParsed?.quoteText || ''
  const inTheKnowLabel = inTheKnowParsed?.label || block.label || IN_THE_KNOW_LABEL
  const inTheKnowText = inTheKnowParsed?.text || ''
  const highlightCalloutLabel = highlightCalloutParsed?.label || block.label || HIGHLIGHT_CALLOUT_LABEL
  const highlightCalloutText = highlightCalloutParsed?.text || ''
  const faqLabel = faqParsed?.label || block.label || FAQ_LABEL
  const faqDraftItems = faqParsed?.items.length
    ? [
        ...faqParsed.items,
        ...Array.from({ length: Math.max(0, 2 - faqParsed.items.length) }, () => ({
          question: '',
          answer: '',
        })),
      ]
    : [
        { question: '', answer: '' },
        { question: '', answer: '' },
      ]
  return (
    <article key={block.id} className={`block-card editorial-card ${isEditMode ? 'editing' : ''}`}>
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

      <div className="editorial-card-body">

      {isEditMode && validation?.status === 'supported' && (
        <div
          style={{
            marginBottom: '0.6rem',
            padding: '0.45rem 0.6rem',
            borderRadius: '8px',
            background: 'rgba(52, 119, 83, 0.12)',
            color: '#2e6f4f',
            fontSize: '0.82rem',
          }}
        >
          Mapped to Payload as <code>{validation.mappedPayloadBlockType}</code>.
        </div>
      )}

      {isEditMode && validation?.status === 'unsupported' && (
        <div
          style={{
            marginBottom: '0.6rem',
            padding: '0.45rem 0.6rem',
            borderRadius: '8px',
            background: 'rgba(188, 120, 0, 0.12)',
            color: '#7f4f00',
            fontSize: '0.82rem',
          }}
        >
          {validation.message}
        </div>
      )}

      {isEditMode && validation?.status === 'invalid' && (
        <div
          style={{
            marginBottom: '0.6rem',
            padding: '0.55rem 0.6rem',
            borderRadius: '8px',
            background: 'rgba(175, 52, 52, 0.12)',
            color: '#852f2f',
            fontSize: '0.82rem',
          }}
        >
          <div style={{ marginBottom: '0.45rem' }}>
            {validation.message}
          </div>
          {options?.onFixBlock && (
            <button
              type="button"
              onClick={options.onFixBlock}
              disabled={options.disableFix}
              style={{
                border: '1px solid rgba(133, 47, 47, 0.4)',
                background: '#fff',
                color: '#852f2f',
                borderRadius: '999px',
                padding: '0.3rem 0.65rem',
                fontSize: '0.78rem',
                cursor: options.disableFix ? 'not-allowed' : 'pointer',
                opacity: options.disableFix ? 0.6 : 1,
              }}
            >
              Fix block
            </button>
          )}
        </div>
      )}

      {isEditMode && supportsStructuredEditor ? (
        <div className="editorial-structured-editor">
          {isKeyTakeaways && (
            <>
              <div className="editorial-field-group">
                <label className="editorial-field-label">Label</label>
                <input
                  type="text"
                  className="editorial-field-input"
                  value={keyTakeawaysLabel}
                  onChange={(event) => options?.onChangeMarkdown?.(
                    buildCanonicalKeyTakeawaysMarkdown(
                      event.target.value,
                      keyTakeawaysDraftItems,
                      { useFallbackItems: false }
                    )
                  )}
                  placeholder={KEY_TAKEAWAYS_LABEL}
                />
              </div>

              <div className="editorial-field-group">
                <div className="editorial-field-row">
                  <label className="editorial-field-label">Takeaways</label>
                  <span className="editorial-field-meta">
                    {keyTakeawaysDraftItems.filter((item) => item.trim().length > 0).length}
                    {' / '}
                    {EDITORIAL_MAX_TAKEAWAYS}
                  </span>
                </div>
                <div className="editorial-takeaway-list">
                  {keyTakeawaysDraftItems.map((item, itemIndex) => (
                    <div key={`${block.id}_takeaway_${itemIndex}`} className="editorial-takeaway-row">
                      <span className="editorial-takeaway-index">{itemIndex + 1}</span>
                      <input
                        type="text"
                        className="editorial-field-input"
                        value={item}
                        onChange={(event) => {
                          const nextItems = [...keyTakeawaysDraftItems]
                          nextItems[itemIndex] = event.target.value
                          options?.onChangeMarkdown?.(
                            buildCanonicalKeyTakeawaysMarkdown(
                              keyTakeawaysLabel,
                              nextItems,
                              { useFallbackItems: false }
                            )
                          )
                        }}
                        placeholder={`Takeaway ${itemIndex + 1}`}
                      />
                      <button
                        type="button"
                        className="editorial-inline-btn danger"
                        onClick={() => {
                          const nextItems = keyTakeawaysDraftItems.filter((_, index) => index !== itemIndex)
                          options?.onChangeMarkdown?.(
                            buildCanonicalKeyTakeawaysMarkdown(
                              keyTakeawaysLabel,
                              nextItems.length ? nextItems : [''],
                              { useFallbackItems: false }
                            )
                          )
                        }}
                        disabled={keyTakeawaysDraftItems.length <= 1}
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
                    onClick={() => options?.onChangeMarkdown?.(
                      buildCanonicalKeyTakeawaysMarkdown(
                        keyTakeawaysLabel,
                        [...keyTakeawaysDraftItems, ''],
                        { useFallbackItems: false }
                      )
                    )}
                    disabled={keyTakeawaysDraftItems.length >= EDITORIAL_MAX_TAKEAWAYS}
                  >
                    Add takeaway
                  </button>
                </div>
              </div>
            </>
          )}

          {isPullQuote && (
            <>
              <div className="editorial-field-group">
                <label className="editorial-field-label">Label</label>
                <input
                  type="text"
                  className="editorial-field-input"
                  value={pullQuoteLabel}
                  onChange={(event) => options?.onChangeMarkdown?.(
                    buildCanonicalPullQuoteMarkdown(
                      event.target.value,
                      pullQuoteText,
                      { useFallbackQuote: false }
                    )
                  )}
                  placeholder={PULL_QUOTE_LABEL}
                />
              </div>

              <div className="editorial-field-group">
                <label className="editorial-field-label">Quote</label>
                <textarea
                  className="editorial-field-textarea"
                  value={pullQuoteText}
                  onChange={(event) => options?.onChangeMarkdown?.(
                    buildCanonicalPullQuoteMarkdown(
                      pullQuoteLabel,
                      event.target.value,
                      { useFallbackQuote: false }
                    )
                  )}
                  rows={3}
                  placeholder="Add the pull quote text"
                />
              </div>
            </>
          )}

          {isInTheKnow && (
            <>
              <div className="editorial-field-group">
                <label className="editorial-field-label">Label</label>
                <input
                  type="text"
                  className="editorial-field-input"
                  value={inTheKnowLabel}
                  onChange={(event) => options?.onChangeMarkdown?.(
                    buildCanonicalInTheKnowMarkdown(
                      event.target.value,
                      inTheKnowText,
                      { useFallbackText: false }
                    )
                  )}
                  placeholder={IN_THE_KNOW_LABEL}
                />
              </div>

              <div className="editorial-field-group">
                <label className="editorial-field-label">Body Text</label>
                <textarea
                  className="editorial-field-textarea"
                  value={inTheKnowText}
                  onChange={(event) => options?.onChangeMarkdown?.(
                    buildCanonicalInTheKnowMarkdown(
                      inTheKnowLabel,
                      event.target.value,
                      { useFallbackText: false }
                    )
                  )}
                  rows={4}
                  placeholder="Add supporting context for this callout"
                />
              </div>
            </>
          )}

          {isHighlightCallout && (
            <>
              <div className="editorial-field-group">
                <label className="editorial-field-label">Label</label>
                <input
                  type="text"
                  className="editorial-field-input"
                  value={highlightCalloutLabel}
                  onChange={(event) => options?.onChangeMarkdown?.(
                    buildCanonicalHighlightCalloutMarkdown(
                      event.target.value,
                      highlightCalloutText,
                      { useFallbackText: false }
                    )
                  )}
                  placeholder={HIGHLIGHT_CALLOUT_LABEL}
                />
              </div>

              <div className="editorial-field-group">
                <label className="editorial-field-label">Body Text</label>
                <textarea
                  className="editorial-field-textarea"
                  value={highlightCalloutText}
                  onChange={(event) => options?.onChangeMarkdown?.(
                    buildCanonicalHighlightCalloutMarkdown(
                      highlightCalloutLabel,
                      event.target.value,
                      { useFallbackText: false }
                    )
                  )}
                  rows={4}
                  placeholder="Add highlight callout text"
                />
              </div>
            </>
          )}

          {isFAQ && (
            <>
              <div className="editorial-field-group">
                <div className="editorial-field-row">
                  <label className="editorial-field-label">Label</label>
                  <span className="editorial-field-meta">
                    {faqDraftItems.filter((item) => item.question.trim() && item.answer.trim()).length}
                    {' / '}
                    {EDITORIAL_MAX_FAQ_ITEMS}
                  </span>
                </div>
                <input
                  type="text"
                  className="editorial-field-input"
                  value={faqLabel}
                  onChange={(event) => options?.onChangeMarkdown?.(
                    buildCanonicalFAQMarkdown(
                      event.target.value,
                      faqDraftItems,
                      { useFallbackItems: false }
                    )
                  )}
                  placeholder={FAQ_LABEL}
                />
              </div>

              <div className="editorial-field-group">
                <label className="editorial-field-label">Questions and Answers</label>
                <div className="editorial-takeaway-list">
                  {faqDraftItems.map((item, itemIndex) => (
                    <div key={`${block.id}_faq_${itemIndex}`} className="editorial-field-group">
                      <div className="editorial-field-row">
                        <span className="editorial-field-meta">FAQ {itemIndex + 1}</span>
                        <button
                          type="button"
                          className="editorial-inline-btn danger"
                          onClick={() => {
                            const nextItems = faqDraftItems.filter((_, index) => index !== itemIndex)
                            options?.onChangeMarkdown?.(
                              buildCanonicalFAQMarkdown(
                                faqLabel,
                                nextItems.length >= 2
                                  ? nextItems
                                  : [
                                      ...nextItems,
                                      ...Array.from({ length: Math.max(0, 2 - nextItems.length) }, () => ({
                                        question: '',
                                        answer: '',
                                      })),
                                    ],
                                { useFallbackItems: false }
                              )
                            )
                          }}
                          disabled={faqDraftItems.length <= 2}
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
                          const nextItems = [...faqDraftItems]
                          nextItems[itemIndex] = {
                            ...nextItems[itemIndex],
                            question: event.target.value,
                          }
                          options?.onChangeMarkdown?.(
                            buildCanonicalFAQMarkdown(
                              faqLabel,
                              nextItems,
                              { useFallbackItems: false }
                            )
                          )
                        }}
                        placeholder="Question"
                      />
                      <textarea
                        className="editorial-field-textarea"
                        value={item.answer}
                        onChange={(event) => {
                          const nextItems = [...faqDraftItems]
                          nextItems[itemIndex] = {
                            ...nextItems[itemIndex],
                            answer: event.target.value,
                          }
                          options?.onChangeMarkdown?.(
                            buildCanonicalFAQMarkdown(
                              faqLabel,
                              nextItems,
                              { useFallbackItems: false }
                            )
                          )
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
                    onClick={() => options?.onChangeMarkdown?.(
                      buildCanonicalFAQMarkdown(
                        faqLabel,
                        [...faqDraftItems, { question: '', answer: '' }],
                        { useFallbackItems: false }
                      )
                    )}
                    disabled={faqDraftItems.length >= EDITORIAL_MAX_FAQ_ITEMS}
                  >
                    Add FAQ item
                  </button>
                </div>
              </div>
            </>
          )}

          <p className="editorial-editor-hint">
            Schema editor keeps block markers and component wiring in the required format.
          </p>
        </div>
      ) : isEditMode ? (
        <div style={{ marginTop: '0.35rem' }}>
          <textarea
            value={block.markdown}
            onChange={(event) => options?.onChangeMarkdown?.(event.target.value)}
            onInput={(event) => resizeTextareaToContent(event.currentTarget)}
            ref={(element) => {
              if (element) resizeTextareaToContent(element)
            }}
            rows={Math.max(8, block.markdown.split('\n').length + 1)}
            className="block-textarea"
            style={{ width: '100%' }}
          />
          <p style={{ marginTop: '0.35rem', fontSize: '0.76rem', opacity: 0.72 }}>
            Unsupported block type. Edit markdown directly.
          </p>
        </div>
      ) : keyTakeawaysParsed && keyTakeawaysParsed.items.length > 0 ? (
        <section className="editorial-preview-card editorial-preview-key-takeaways">
          <h4>{keyTakeawaysParsed.label || KEY_TAKEAWAYS_LABEL}</h4>
          <ul>
            {keyTakeawaysParsed.items.map((item, itemIndex) => (
              <li key={`${block.id}_takeaway_${itemIndex}`}>{item}</li>
            ))}
          </ul>
        </section>
      ) : pullQuoteParsed && pullQuoteParsed.quoteText ? (
        <figure className="editorial-preview-card editorial-preview-pull-quote">
          <blockquote>
            <p>{`"${pullQuoteParsed.quoteText}"`}</p>
          </blockquote>
        </figure>
      ) : inTheKnowParsed && inTheKnowParsed.text ? (
        <section className="editorial-preview-card editorial-preview-in-the-know">
          <h4>{inTheKnowParsed.label || IN_THE_KNOW_LABEL}</h4>
          <p>{inTheKnowParsed.text}</p>
        </section>
      ) : highlightCalloutParsed && highlightCalloutParsed.text ? (
        <section className="editorial-preview-card editorial-preview-in-the-know">
          <h4>{highlightCalloutParsed.label || HIGHLIGHT_CALLOUT_LABEL}</h4>
          <p>{highlightCalloutParsed.text}</p>
        </section>
      ) : faqParsed && faqParsed.items.length > 0 ? (
        <section className="editorial-preview-card editorial-preview-key-takeaways">
          <h4>{faqParsed.label || FAQ_LABEL}</h4>
          <ul>
            {faqParsed.items.map((item, itemIndex) => (
              <li key={`${block.id}_faq_preview_${itemIndex}`}>
                <strong>{item.question}</strong>
                <p style={{ margin: '0.35rem 0 0' }}>{item.answer}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : previewMarkdown ? (
        <div className="block-preview">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {previewMarkdown}
          </ReactMarkdown>
        </div>
      ) : (
        <p style={{ fontSize: '0.85rem', opacity: 0.7, margin: 0 }}>
          No preview content available.
        </p>
      )}

      {isEditMode && (
        <details className="editorial-markdown-details">
          <summary>{supportsStructuredEditor ? 'Generated markdown' : 'Raw markdown'}</summary>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              marginTop: '0.5rem',
              fontSize: '0.78rem',
            }}
          >
            {block.markdown}
          </pre>
        </details>
      )}
      </div>
    </article>
  )
}
