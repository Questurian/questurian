import {
  FAQ_COMPONENT,
  HIGHLIGHT_CALLOUT_COMPONENT,
  IN_THE_KNOW_COMPONENT,
  KEY_TAKEAWAYS_COMPONENT,
  PULL_QUOTE_COMPONENT,
} from '../constants'

export function normalizeEditorialComponentKey(component: string): string {
  const normalized = component.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (
    normalized === 'pull_quote'
    || normalized === 'pullquote'
    || normalized === 'quote'
  ) {
    return PULL_QUOTE_COMPONENT
  }
  if (
    normalized === 'key_takeaway'
    || normalized === 'key_takeaways'
    || normalized === 'takeaways'
    || normalized === 'key_takeaway_box'
    || normalized === 'key_takeaways_box'
  ) {
    return KEY_TAKEAWAYS_COMPONENT
  }
  if (
    normalized === 'in_the_know'
    || normalized === 'in_theknow'
    || normalized === 'in_the_know_box'
    || normalized === 'in_theknow_box'
    || normalized === 'in_the_know_callout'
  ) {
    return IN_THE_KNOW_COMPONENT
  }
  if (
    normalized === 'highlight_callout'
    || normalized === 'highlight'
    || normalized === 'highlight_box'
    || normalized === 'highlight_callout_box'
    || normalized === 'highlightcallout'
  ) {
    return HIGHLIGHT_CALLOUT_COMPONENT
  }
  if (
    normalized === 'faq_block'
    || normalized === 'faq'
    || normalized === 'faqs'
    || normalized === 'frequently_asked_questions'
    || normalized === 'qa_block'
    || normalized === 'q_and_a_block'
    || normalized === 'qanda_block'
  ) {
    return FAQ_COMPONENT
  }
  return normalized
}
