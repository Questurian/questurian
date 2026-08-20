import type { JSX, ReactNode } from 'react'

/**
 * Minimal inline-markdown renderer for editorial block copy.
 *
 * The editorial blocks store their copy in plain `text` / `textarea` fields,
 * but the writing pipeline emits markdown into them -- so `**Who should stay
 * here:**` was reaching the page as literal asterisks. This renders the inline
 * subset that actually shows up in that copy (bold, italic, code, links) and
 * leaves everything else as text.
 *
 * Block-level markdown is deliberately not handled: these fields are single
 * runs of prose, and anything richer belongs in a Text block's rich text.
 *
 * Output is React nodes, never `dangerouslySetInnerHTML`, so nothing in the
 * stored copy can inject markup.
 */

/**
 * Built fresh per `parse` call, never shared. A `/g` regex carries mutable
 * `lastIndex`, and `parse` recurses into its own matches -- a shared instance
 * would have the inner call rewind the outer loop's cursor and spin forever.
 */
function inlinePattern(): RegExp {
  return /(\*\*|__)([^\s][\s\S]*?[^\s]|[^\s])\1|\*([^\s*][\s\S]*?[^\s*]|[^\s*])\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g
}

/** Only in-document and http(s) targets -- blocks `javascript:` and friends. */
function safeHref(href: string): string | null {
  if (href.startsWith('/') || href.startsWith('#')) return href
  if (/^https?:\/\//i.test(href)) return href
  return null
}

function parse(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  const pattern = inlinePattern()

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    const key = `${keyPrefix}-${match.index}`
    const [, , bold, italic, code, linkText, linkHref] = match

    if (bold !== undefined) {
      nodes.push(<strong key={key} className="font-semibold">{parse(bold, key)}</strong>)
    } else if (italic !== undefined) {
      nodes.push(<em key={key}>{parse(italic, key)}</em>)
    } else if (code !== undefined) {
      nodes.push(
        <code key={key} className="font-mono text-[0.9em]">
          {code}
        </code>,
      )
    } else if (linkText !== undefined && linkHref !== undefined) {
      const href = safeHref(linkHref)
      nodes.push(
        href ? (
          <a key={key} href={href} className="text-accent underline underline-offset-2">
            {parse(linkText, key)}
          </a>
        ) : (
          <span key={key}>{parse(linkText, key)}</span>
        ),
      )
    }

    lastIndex = match.index + match[0].length
    // Belt and braces: a zero-length match would never advance the cursor.
    if (match[0].length === 0) pattern.lastIndex += 1
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}

export function InlineMarkdown({ text }: { text: string }): JSX.Element {
  return <>{parse(text, 'md')}</>
}
