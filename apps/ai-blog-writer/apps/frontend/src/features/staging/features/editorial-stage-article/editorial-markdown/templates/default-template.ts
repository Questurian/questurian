import {
  FAQ_COMPONENT,
  FAQ_LABEL,
  HIGHLIGHT_CALLOUT_COMPONENT,
  HIGHLIGHT_CALLOUT_LABEL,
  IN_THE_KNOW_COMPONENT,
  IN_THE_KNOW_LABEL,
  KEY_TAKEAWAYS_LABEL,
  PULL_QUOTE_COMPONENT,
  PULL_QUOTE_LABEL,
} from '../../constants'
import type { SupportedEditorialComponent } from '../../types'
import {
  buildCanonicalFAQMarkdown,
  buildCanonicalHighlightCalloutMarkdown,
  buildCanonicalInTheKnowMarkdown,
  buildCanonicalKeyTakeawaysMarkdown,
  buildCanonicalPullQuoteMarkdown,
} from './canonical-markdown'

export function buildDefaultEditorialTemplate(
  component: SupportedEditorialComponent
): {
  label: string
  markdown: string
} {
  if (component === PULL_QUOTE_COMPONENT) {
    return {
      label: PULL_QUOTE_LABEL,
      markdown: buildCanonicalPullQuoteMarkdown(PULL_QUOTE_LABEL, ''),
    }
  }

  if (component === IN_THE_KNOW_COMPONENT) {
    return {
      label: IN_THE_KNOW_LABEL,
      markdown: buildCanonicalInTheKnowMarkdown(IN_THE_KNOW_LABEL, ''),
    }
  }

  if (component === HIGHLIGHT_CALLOUT_COMPONENT) {
    return {
      label: HIGHLIGHT_CALLOUT_LABEL,
      markdown: buildCanonicalHighlightCalloutMarkdown(HIGHLIGHT_CALLOUT_LABEL, ''),
    }
  }

  if (component === FAQ_COMPONENT) {
    return {
      label: FAQ_LABEL,
      markdown: buildCanonicalFAQMarkdown(FAQ_LABEL, []),
    }
  }

  return {
    label: KEY_TAKEAWAYS_LABEL,
    markdown: buildCanonicalKeyTakeawaysMarkdown(KEY_TAKEAWAYS_LABEL, []),
  }
}
