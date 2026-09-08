import type { IntakeFinding } from '../intake.types'

/**
 * Tying a finding to the paragraph it is about.
 *
 * The editor copies a quote out of the article by hand, and the article it
 * copied from has bold, links and typographic punctuation in it. Matching
 * character for character against the markdown source therefore fails often,
 * and it fails silently: the finding simply stops appearing anywhere. So the
 * match is deliberately loose, and it anchors to the *paragraph* rather than
 * to a span inside it.
 *
 * Paragraph granularity is the honest promise. "This passage has a problem"
 * is something a loose match can say truthfully; "these exact eleven words are
 * the problem" is not, and a highlight one word off reads as the machine
 * misquoting the article. The exact quote is shown on the finding itself,
 * where a person can compare it with the paragraph beside it.
 *
 * Anything that cannot be anchored is returned rather than dropped. A finding
 * nobody can see is worse than one in a list at the bottom, and the whole
 * point of this phase is that every finding gets read.
 */

/** Blocks that carry findings, in document order, plus what could not be tied. */
export interface AnchoredArticle {
  blocks: ArticleBlock[]
  /** Findings about the whole piece, and quotes that matched no paragraph. */
  unanchored: IntakeFinding[]
}

export interface ArticleBlock {
  /** The markdown for this block, rendered as-is. */
  markdown: string
  /** Findings whose quote landed here, worst first. */
  findings: IntakeFinding[]
}

/**
 * The comparable form of a piece of text.
 *
 * Everything that differs between what the editor typed and what the markdown
 * holds, and nothing that changes what the words are: case, the typographic
 * quotes and dashes a model writes where the source has ASCII, markdown's own
 * punctuation, and runs of whitespace where the source wraps a line.
 */
export function comparable(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/ /g, ' ')
    // Link text survives, the URL does not: the editor quotes what it read.
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The article split the way a reader sees it: one block per paragraph.
 *
 * Fenced code is kept whole. Splitting inside a fence would produce blocks
 * that are not valid markdown on their own, and each would render as its own
 * broken code block.
 */
export function articleBlocks(markdown: string): string[] {
  const blocks: string[] = []
  let current: string[] = []
  let fenced = false

  const flush = () => {
    const text = current.join('\n').trim()
    if (text) blocks.push(text)
    current = []
  }

  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced
      current.push(line)
      if (!fenced) flush()
      continue
    }
    if (!fenced && line.trim() === '') {
      flush()
      continue
    }
    current.push(line)
  }
  flush()
  return blocks
}

/**
 * How much of a quote has to match before a paragraph counts as the one.
 *
 * A quote that spans a paragraph break can never match any single block in
 * full, so a prefix is tried. Long enough that it cannot land on the wrong
 * paragraph by coincidence, short enough to survive the editor trimming or
 * paraphrasing the tail of a long passage.
 */
const PREFIX_CHARS = 60

function blockFor(blocks: string[], quote: string): number {
  const needle = comparable(quote)
  if (!needle) return -1
  const haystacks = blocks.map(comparable)

  const whole = haystacks.findIndex((block) => block.includes(needle))
  if (whole !== -1) return whole
  if (needle.length <= PREFIX_CHARS) return -1

  // The quote runs past the end of its paragraph. Its opening words are still
  // in exactly one of them.
  const prefix = needle.slice(0, PREFIX_CHARS)
  return haystacks.findIndex((block) => block.includes(prefix))
}

/** Tie each finding to a paragraph, and say which ones could not be tied. */
export function anchorFindings(
  markdown: string,
  findings: IntakeFinding[],
): AnchoredArticle {
  const blocks = articleBlocks(markdown).map(
    (text): ArticleBlock => ({ markdown: text, findings: [] }),
  )
  const unanchored: IntakeFinding[] = []

  for (const finding of findings) {
    // A fault that is not in one passage is not made clearer by being pinned
    // to an arbitrary one.
    const index = finding.whole_article ? -1 : blockFor(
      blocks.map((block) => block.markdown),
      finding.quote,
    )
    if (index === -1) unanchored.push(finding)
    else blocks[index].findings.push(finding)
  }

  return { blocks, unanchored }
}

/** The worst severity among these findings, for colouring a marked paragraph. */
export function worstSeverity(
  findings: IntakeFinding[],
): IntakeFinding['severity'] | null {
  for (const severity of ['serious', 'notable', 'minor'] as const) {
    if (findings.some((item) => item.severity === severity)) return severity
  }
  return null
}
