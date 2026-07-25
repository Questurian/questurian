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
  PULL_QUOTE_LABEL,
} from '../../features/editorial-stage-article/constants'
import {
  buildCanonicalHighlightCalloutMarkdown,
  buildCanonicalInTheKnowMarkdown,
  buildCanonicalPullQuoteMarkdown,
  parseFAQEditorialBlock,
  parseHighlightCalloutEditorialBlock,
  parseInTheKnowEditorialBlock,
  parseKeyTakeawayEditorialBlock,
  parsePullQuoteEditorialBlock,
} from '../../features/editorial-stage-article/editorial-markdown.service'
import { FAQEditor } from './FAQEditor'
import { KeyTakeawaysEditor } from './KeyTakeawaysEditor'
import { LabeledTextEditorialBlockEditor } from './LabeledTextEditorialBlockEditor'

type StructuredEditorialBlockEditorProps = {
  block: EditorialBlock
  normalizedComponent: string
  onChangeMarkdown: (nextMarkdown: string) => void
}

export function StructuredEditorialBlockEditor({
  block,
  normalizedComponent,
  onChangeMarkdown,
}: StructuredEditorialBlockEditorProps) {
  let editor: React.ReactNode = null

  if (normalizedComponent === KEY_TAKEAWAYS_COMPONENT) {
    const parsed = parseKeyTakeawayEditorialBlock(block)
    editor = (
      <KeyTakeawaysEditor
        blockId={block.id}
        label={parsed.label || block.label || KEY_TAKEAWAYS_LABEL}
        items={parsed.rawItems.length ? parsed.rawItems : ['']}
        onChangeMarkdown={onChangeMarkdown}
      />
    )
  } else if (normalizedComponent === PULL_QUOTE_COMPONENT) {
    const parsed = parsePullQuoteEditorialBlock(block)
    editor = (
      <LabeledTextEditorialBlockEditor
        label={parsed.label || block.label || PULL_QUOTE_LABEL}
        labelPlaceholder={PULL_QUOTE_LABEL}
        text={parsed.quoteText || ''}
        textLabel="Quote"
        textPlaceholder="Add the pull quote text"
        rows={3}
        buildMarkdown={(label, text) => buildCanonicalPullQuoteMarkdown(
          label,
          text,
          { useFallbackQuote: false },
        )}
        onChangeMarkdown={onChangeMarkdown}
      />
    )
  } else if (normalizedComponent === IN_THE_KNOW_COMPONENT) {
    const parsed = parseInTheKnowEditorialBlock(block)
    editor = (
      <LabeledTextEditorialBlockEditor
        label={parsed.label || block.label || IN_THE_KNOW_LABEL}
        labelPlaceholder={IN_THE_KNOW_LABEL}
        text={parsed.text || ''}
        textLabel="Body Text"
        textPlaceholder="Add supporting context for this callout"
        rows={4}
        buildMarkdown={(label, text) => buildCanonicalInTheKnowMarkdown(
          label,
          text,
          { useFallbackText: false },
        )}
        onChangeMarkdown={onChangeMarkdown}
      />
    )
  } else if (normalizedComponent === HIGHLIGHT_CALLOUT_COMPONENT) {
    const parsed = parseHighlightCalloutEditorialBlock(block)
    editor = (
      <LabeledTextEditorialBlockEditor
        label={parsed.label || block.label || HIGHLIGHT_CALLOUT_LABEL}
        labelPlaceholder={HIGHLIGHT_CALLOUT_LABEL}
        text={parsed.text || ''}
        textLabel="Body Text"
        textPlaceholder="Add highlight callout text"
        rows={4}
        buildMarkdown={(label, text) => buildCanonicalHighlightCalloutMarkdown(
          label,
          text,
          { useFallbackText: false },
        )}
        onChangeMarkdown={onChangeMarkdown}
      />
    )
  } else if (normalizedComponent === FAQ_COMPONENT) {
    const parsed = parseFAQEditorialBlock(block)
    const items = parsed.items.length
      ? [
          ...parsed.items,
          ...Array.from({ length: Math.max(0, 2 - parsed.items.length) }, () => ({
            question: '',
            answer: '',
          })),
        ]
      : [
          { question: '', answer: '' },
          { question: '', answer: '' },
        ]
    editor = (
      <FAQEditor
        blockId={block.id}
        label={parsed.label || block.label || FAQ_LABEL}
        items={items}
        onChangeMarkdown={onChangeMarkdown}
      />
    )
  }

  return (
    <div className="editorial-structured-editor">
      {editor}
      <p className="editorial-editor-hint">
        Schema editor keeps block markers and component wiring in the required format.
      </p>
    </div>
  )
}
