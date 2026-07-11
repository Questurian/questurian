'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { JSX } from 'react'
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

  return (
    <span
      role="link"
      tabIndex={0}
      className={className}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        router.push(href)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.stopPropagation()
          router.push(href)
        }
      }}
    >
      {children}
    </span>
  )
}
