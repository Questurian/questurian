'use client'

import Link from '@/components/navigation/PublicLink'
import { useRouter } from 'next/navigation'
import type { JSX, KeyboardEvent, MouseEvent } from 'react'
import { navigateWithFeedback } from '@/components/navigation/navigationFeedbackStore'
import { authorPath } from '@/features/authors/lib/authorPath'

type AuthorLinkProps = {
  /** SEO-friendly author slug — preferred when available */
  authorSlug?: string | null
  /** Numeric fallback for authors without a slug yet */
  authorId?: number | string | null
  children: React.ReactNode
  className?: string
  /**
   * Set when this byline is rendered inside another <a>/<Link> (e.g. a card
   * that links to the article). Nested anchors are invalid HTML, so this
   * renders a span that navigates on click instead.
   */
  nested?: boolean
}

export function AuthorLink({
  authorSlug,
  authorId,
  children,
  className,
  nested,
}: AuthorLinkProps): JSX.Element {
  const router = useRouter()

  const href = authorPath({ slug: authorSlug, id: authorId })

  if (!href) {
    return <span className={className}>{children}</span>
  }

  if (!nested) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    )
  }

  // A span has no link status of its own, so it navigates inside the root
  // owner's transition. Modified clicks open a tab, as an anchor would.
  const follow = (e: MouseEvent<HTMLSpanElement> | KeyboardEvent<HTMLSpanElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      window.open(href, '_blank', 'noopener')
      return
    }
    if (!navigateWithFeedback(href)) router.push(href)
  }

  return (
    <span
      role="link"
      tabIndex={0}
      className={className}
      onClick={follow}
      onKeyDown={(e) => {
        if (e.key === 'Enter') follow(e)
      }}
    >
      {children}
    </span>
  )
}
