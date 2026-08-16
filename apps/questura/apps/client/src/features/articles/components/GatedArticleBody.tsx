'use client'

import { useCallback, useEffect, useState } from 'react'

import { get } from '@/lib/api'
import { BlockRenderer } from '@/features/articles/components/BlockRenderer'
import { PaywallNotice } from '@/features/articles/components/PaywallNotice'
import type { GateState } from '@/features/articles/lib/gate'
import type { ContentBlock } from '@/features/articles/types'
import type { CurrentPrincipalResponse } from '@/lib/user/types'

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

type Phase = 'identifying' | 'anonymous' | 'loading' | 'ready' | 'failed'

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
 *
 * Plain fetch rather than React Query, deliberately. The public shell has no
 * `QueryClientProvider`: ADR-0003 keeps React Query in the dynamic/private
 * route group and lazy islands, so calling a `useQuery` hook here throws during
 * render and 500s the page. This component is the one client island under the
 * public shell, and it has to stand on its own.
 */
export function GatedArticleBody({ articleId, gate, path, lang }: GatedArticleBodyProps) {
  const [phase, setPhase] = useState<Phase>('identifying')
  const [blocks, setBlocks] = useState<ContentBlock[] | null>(null)
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => {
    setPhase('identifying')
    setAttempt((value) => value + 1)
  }, [])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      let isMember = false

      try {
        const me = await get<CurrentPrincipalResponse>('/api/me')
        isMember = me.principal?.membership.active === true
      } catch {
        // An anonymous reader is the overwhelmingly common case here, and
        // /api/me answers 401 for them. Treat any failure to identify as
        // "not a member" -- the paywall is the safe answer when we cannot
        // tell, since the alternative is serving paid content on an error.
        if (!cancelled) setPhase('anonymous')
        return
      }

      if (cancelled) return

      if (!isMember) {
        setPhase('anonymous')
        return
      }

      setPhase('loading')

      try {
        const full = await get<FullArticleResponse>(
          `/api/public/articles/full?type=articles&id=${encodeURIComponent(String(articleId))}` +
            `&lang=${encodeURIComponent(lang ?? 'en')}`,
        )
        if (cancelled) return

        if (!full.contentBlocks) {
          setPhase('failed')
          return
        }

        setBlocks(full.contentBlocks)
        setPhase('ready')
      } catch {
        // A member whose fetch failed is not a non-member. Falling through to
        // the paywall would tell someone who paid that they had not.
        if (!cancelled) setPhase('failed')
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [articleId, lang, attempt])

  // The notice is what the server renders and what the browser renders first,
  // so the two agree and hydration is stable.
  //
  // This costs a member a brief flash of the lock before the swap, which an
  // earlier version avoided by showing a skeleton until identity was known.
  // That was wrong: the skeleton is what would sit in the cached HTML, so a
  // crawler and any reader without JS would get a loading placeholder instead
  // of the sample's call to action -- and the page's paywall JSON-LD points at
  // `[data-paywalled]`, which lives on this notice. No notice in the HTML means
  // that selector matches nothing and the structured data describes a part of
  // the page that is not there. Indexability is the constraint this whole
  // design exists to protect; a flash is not.
  if (phase === 'identifying' || phase === 'anonymous') {
    return <PaywallNotice gate={gate} returnTo={path} />
  }

  if (phase === 'loading') {
    return <BodySkeleton />
  }

  if (phase === 'failed' || !blocks) {
    return (
      <div role="alert" className="rounded-lg border border-foreground/12 px-6 py-10 text-center">
        <p className="text-sm text-foreground/70">
          We couldn&rsquo;t load the rest of this article.
        </p>
        <button
          type="button"
          onClick={retry}
          className="mt-4 rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground/5"
        >
          Try again
        </button>
      </div>
    )
  }

  // The full body includes the sample blocks the server already rendered, so
  // the sample is dropped here rather than duplicated above this component.
  const remaining = blocks.slice(gate.shown)

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
