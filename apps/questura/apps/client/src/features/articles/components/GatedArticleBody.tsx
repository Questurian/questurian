'use client'

import { useQuery } from '@tanstack/react-query'

import { APIError, get } from '@/lib/api'
import { useUserQuery } from '@/lib/user/hooks/useUserQuery'
import { BlockRenderer } from '@/features/articles/components/BlockRenderer'
import { PaywallNotice } from '@/features/articles/components/PaywallNotice'
import type { GateState } from '@/features/articles/lib/gate'
import type { ContentBlock } from '@/features/articles/types'

type GatedArticleBodyProps = {
  articleId: number
  gate: GateState
  /** Path the reader is on, so checkout can return them to it. */
  path: string
  lang?: string
}

type FullArticleResponse = {
  contentBlocks?: ContentBlock[]
}

/**
 * The locked region of a Gated item.
 *
 * Renders one of three things, and which one it must never get wrong is the
 * whole point: a paying member must not see a paywall for content they own,
 * and a non-member must not see the body.
 *
 * Client-side because the cached public shell is `force-static`, where
 * `cookies()` is empty by construction -- no page under it can know who is
 * reading (ADR-0009).
 */
export function GatedArticleBody({ articleId, gate, path, lang }: GatedArticleBodyProps) {
  const { data: user, isPending: identityPending } = useUserQuery()
  const isMember = user?.membership?.active === true

  const body = useQuery({
    queryKey: ['article-full', articleId, lang ?? 'en'],
    // Only a member may ask. Firing this for anonymous readers would turn every
    // cached article page into a guaranteed 401 against the dynamic route.
    enabled: isMember,
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      if (error instanceof APIError && error.status >= 400 && error.status < 500) return false
      return failureCount < 2
    },
    queryFn: () =>
      get<FullArticleResponse>(
        `/api/public/articles/full?type=articles&id=${encodeURIComponent(String(articleId))}` +
          `&lang=${encodeURIComponent(lang ?? 'en')}`,
      ),
  })

  // Identity unknown. Showing the paywall here would flash a lock at a member
  // who has already paid, on every single page load -- the cached HTML is
  // identical for everyone, so this branch is what every reader hits first.
  if (identityPending || (isMember && body.isPending)) {
    return <BodySkeleton />
  }

  if (!isMember) {
    return <PaywallNotice gate={gate} returnTo={path} />
  }

  // A member whose fetch failed is not a non-member. Falling through to the
  // paywall would tell someone who paid that they had not, which is worse than
  // admitting the load failed.
  if (body.isError || !body.data?.contentBlocks) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-foreground/12 px-6 py-10 text-center"
      >
        <p className="text-sm text-foreground/70">
          We couldn&rsquo;t load the rest of this article.
        </p>
        <button
          type="button"
          onClick={() => body.refetch()}
          className="mt-4 rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground/5"
        >
          Try again
        </button>
      </div>
    )
  }

  // The full body includes the sample blocks the server already rendered, so
  // the sample is dropped here rather than duplicated above this component.
  const remaining = body.data.contentBlocks.slice(gate.shown)

  return (
    <>
      {remaining.map((block) => (
        <BlockRenderer key={block.id} block={block} />
      ))}
    </>
  )
}

function BodySkeleton() {
  return (
    <div aria-hidden className="space-y-4" data-testid="gated-body-skeleton">
      {[0, 1, 2, 3, 4].map((row) => (
        <div
          key={row}
          className="h-4 animate-pulse rounded bg-foreground/10"
          style={{ width: `${[100, 96, 88, 98, 62][row]}%` }}
        />
      ))}
    </div>
  )
}
