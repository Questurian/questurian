export type MarkdownInputRule =
  | { type: 'heading'; level: number }
  | { type: 'unordered-list' }
  | { type: 'ordered-list' }
  | { type: 'blockquote' }

/**
 * Matches the markdown shorthand typed at the start of a block, at the moment
 * the author presses space.
 *
 * `text` is everything between the block's start and the caret, so a match here
 * means the whole run is shorthand and nothing else. Anchoring both ends is
 * what keeps `5. ` in "Rated 5. Best in class" from turning into a list.
 */
export function matchMarkdownInputRule(text: string): MarkdownInputRule | null {
  const heading = text.match(/^(#{1,6})$/)
  if (heading) {
    return { type: 'heading', level: heading[1].length }
  }

  if (/^[-*+]$/.test(text)) {
    return { type: 'unordered-list' }
  }

  // Bounded so a long digit run reads as prose, not an ordered list.
  if (/^\d{1,9}[.)]$/.test(text)) {
    return { type: 'ordered-list' }
  }

  if (text === '>') {
    return { type: 'blockquote' }
  }

  return null
}
