'use client'

import { useCallback, useEffect, useState } from 'react'

import { get } from '@/lib/api'
import type { CurrentPrincipalResponse } from '@/lib/user/types'

export type GatedPhase = 'identifying' | 'anonymous' | 'loading' | 'ready' | 'failed'

/** `type` as the public routes name it, not the Payload collection slug. */
export type GatedArticleType = 'articles' | 'itineraries' | 'maps'

type UseGatedFullArticleOptions<T> = {
  articleId: number
  type: GatedArticleType
  /** Skip everything when the item is not gated. */
  enabled: boolean
  lang?: string
}

type UseGatedFullArticleResult<T> = {
  phase: GatedPhase
  data: T | null
  retry: () => void
}

/**
 * Identifies the reader and, if they are entitled, fetches the full body of a
 * Gated item (ADR-0009).
 *
 * Shared by every gated surface so the three-way decision -- notice, skeleton,
 * body -- is made in one place. A paying member must not see a paywall for
 * content they own, and a non-member must not see the body; that is not a
 * judgement worth reimplementing per content type.
 *
 * Plain fetch rather than React Query on purpose. The public shell has no
 * `QueryClientProvider` (ADR-0003 keeps React Query in the dynamic/private
 * group), and calling a `useQuery` hook under it throws during render and 500s
 * the page. That is not hypothetical -- it shipped, and it is why this hook
 * exists as the single place that knows better.
 */
export function useGatedFullArticle<T>({
  articleId,
  type,
  enabled,
  lang,
}: UseGatedFullArticleOptions<T>): UseGatedFullArticleResult<T> {
  const [phase, setPhase] = useState<GatedPhase>('identifying')
  const [data, setData] = useState<T | null>(null)
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => {
    setPhase('identifying')
    setAttempt((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    const run = async () => {
      let isMember = false

      try {
        const me = await get<CurrentPrincipalResponse>('/api/me')
        isMember = me.principal?.membership.active === true
      } catch {
        // Anonymous is the common case and /api/me answers 401 for it. Any
        // failure to identify reads as "not a member": the notice is the safe
        // answer when we cannot tell, since the alternative is serving paid
        // content on an error.
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
        const full = await get<T>(
          `/api/public/articles/full?type=${type}&id=${encodeURIComponent(String(articleId))}` +
            `&lang=${encodeURIComponent(lang ?? 'en')}`,
        )
        if (cancelled) return

        setData(full)
        setPhase('ready')
      } catch {
        // A member whose fetch failed is not a non-member. Falling through to
        // the notice would tell someone who paid that they had not.
        if (!cancelled) setPhase('failed')
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [articleId, type, lang, enabled, attempt])

  return { phase, data, retry }
}
