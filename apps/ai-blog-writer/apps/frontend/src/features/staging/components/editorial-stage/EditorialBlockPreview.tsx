import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { EditorialBlock } from '../../types'
import {
  FAQ_COMPONENT,
  FAQ_LABEL,
  HIGHLIGHT_CALLOUT_COMPONENT,
  HIGHLIGHT_CALLOUT_LABEL,
  IN_THE_KNOW_COMPONENT,
  IN_THE_KNOW_LABEL,
  KEY_TAKEAWAYS_COMPONENT,
  KEY_TAKEAWAYS_LABEL,
  PULL_QUOTE_COMPONENT,
} from '../../features/editorial-stage-article/constants'
import {
  getEditorialBlockBody,
  parseFAQEditorialBlock,
  parseHighlightCalloutEditorialBlock,
  parseInTheKnowEditorialBlock,
  parseKeyTakeawayEditorialBlock,
  parsePullQuoteEditorialBlock,
} from '../../features/editorial-stage-article/editorial-markdown.service'

type EditorialBlockPreviewProps = {
  block: EditorialBlock
  normalizedComponent: string
}

function EditorialBlockPreviewComponent({
  block,
  normalizedComponent,
}: EditorialBlockPreviewProps) {
  if (normalizedComponent === KEY_TAKEAWAYS_COMPONENT) {
    const parsed = parseKeyTakeawayEditorialBlock(block)
    if (parsed.items.length > 0) {
      return (
        <section className="editorial-preview-card editorial-preview-key-takeaways">
          <h4>{parsed.label || KEY_TAKEAWAYS_LABEL}</h4>
          <ul>
            {parsed.items.map((item, itemIndex) => (
              <li key={`${block.id}_takeaway_${itemIndex}`}>{item}</li>
            ))}
          </ul>
        </section>
      )
    }
  }

  if (normalizedComponent === PULL_QUOTE_COMPONENT) {
    const parsed = parsePullQuoteEditorialBlock(block)
    if (parsed.quoteText) {
      return (
        <figure className="editorial-preview-card editorial-preview-pull-quote">
          <blockquote>
            <p>{`"${parsed.quoteText}"`}</p>
          </blockquote>
        </figure>
      )
    }
  }

  if (normalizedComponent === IN_THE_KNOW_COMPONENT) {
    const parsed = parseInTheKnowEditorialBlock(block)
    if (parsed.text) {
      return (
        <section className="editorial-preview-card editorial-preview-in-the-know">
          <h4>{parsed.label || IN_THE_KNOW_LABEL}</h4>
          <p>{parsed.text}</p>
        </section>
      )
    }
  }

  if (normalizedComponent === HIGHLIGHT_CALLOUT_COMPONENT) {
    const parsed = parseHighlightCalloutEditorialBlock(block)
    if (parsed.text) {
      return (
        <section className="editorial-preview-card editorial-preview-in-the-know">
          <h4>{parsed.label || HIGHLIGHT_CALLOUT_LABEL}</h4>
          <p>{parsed.text}</p>
        </section>
      )
    }
  }

  if (normalizedComponent === FAQ_COMPONENT) {
    const parsed = parseFAQEditorialBlock(block)
    if (parsed.items.length > 0) {
      return (
        <section className="editorial-preview-card editorial-preview-key-takeaways">
          <h4>{parsed.label || FAQ_LABEL}</h4>
          <ul>
            {parsed.items.map((item, itemIndex) => (
              <li key={`${block.id}_faq_preview_${itemIndex}`}>
                <strong>{item.question}</strong>
                <p style={{ margin: '0.35rem 0 0' }}>{item.answer}</p>
              </li>
            ))}
          </ul>
        </section>
      )
    }
  }

  const previewMarkdown = getEditorialBlockBody(block.markdown)
  if (previewMarkdown) {
    return (
      <div className="block-preview">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {previewMarkdown}
        </ReactMarkdown>
      </div>
    )
  }

  return (
    <p style={{ fontSize: '0.85rem', opacity: 0.7, margin: 0 }}>
      No preview content available.
    </p>
  )
}

/*
 * Memoized for the same reason as ContentBlockPreview: editing a content block
 * replaces the blocks array and re-renders the whole timeline, but the editorial
 * blocks themselves are untouched, so their markdown should not be re-parsed.
 */
export const EditorialBlockPreview = memo(EditorialBlockPreviewComponent)
