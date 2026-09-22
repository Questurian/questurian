'use client'

import { useCallback, useEffect, useState } from 'react'

import { get, isUnauthenticated, RequestError } from '@/lib/api'
import { identityStore, SHARED_IDENTITY_MAX_AGE_MS } from '@/lib/user/currentIdentity'
import { identityFromResponse, IdentitySuperseded } from '@/lib/user/identity'

/**
 * - `identifying`: asking who the reader is.
 * - `anonymous`: signed out, or signed in without membership — the notice.
 * - `unverified`: could not find out (overload, network, challenge). **Not**
 *   the notice: telling a paying reader they have not paid, because the
 *   backend was busy, is the failure this state exists to prevent.
 * - `loading` / `ready` / `failed`: the member body.
 */
export type GatedPhase = 'identifying' | 'anonymous' | 'unverified' | 'loading' | 'ready' | 'failed'

/** `type` as the public routes name it, not the Payload collection slug. */
export type GatedArticleType = 'articles' | 'itineraries' | 'maps'

type UseGatedFullArticleOptions = {
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
 * Shared by every gated surface so the decision -- notice, skeleton, body,
 * or "could not check" -- is made in one place. A paying member must not see
 * a paywall for content they own, and a non-member must not see the body;
 * that is not a judgement worth reimplementing per content type.
 *
 * Plain fetch rather than React Query on purpose. The public shell has no
 * `QueryClientProvider` (ADR-0003 keeps React Query in the dynamic/private
 * group), and calling a `useQuery` hook under it throws during render and 500s
 * the page. That is not hypothetical -- it shipped, and it is why this hook
 * exists as the single place that knows better.
 *
 * Identity comes from the page's shared store (`lib/user/currentIdentity.ts`),
 * so the navbar and this hook send one `/api/me` between them. When the reader
 * changes (sign-in, sign-out), the store says so and this hook starts over
 * with its previous body cleared — reader A's body is never shown to reader B.
 * The body request is aborted when the article or the reader changes.
 */
export function useGatedFullArticle<T>({
  articleId,
  type,
  enabled,
  lang,
}: UseGatedFullArticleOptions): UseGatedFullArticleResult<T> {
  const [phase, setPhase] = useState<GatedPhase>('identifying')
  const [data, setData] = useState<T | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [reader, setReader] = useState(() => identityStore.currentGeneration)

  const retry = useCallback(() => {
    setPhase('identifying')
    setAttempt((value) => value + 1)
  }, [])

  useEffect(() => identityStore.subscribe(setReader), [])

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    const controller = new AbortController()
    // Whatever was on screen belonged to the previous article or reader.
    setData(null)
    setPhase('identifying')

    const run = async () => {
      let member = false

      try {
        const identity = identityFromResponse(await identityStore.read({ maxAgeMs: SHARED_IDENTITY_MAX_AGE_MS }))
        member = identity.state === 'signed-in' && identity.member
      } catch (error) {
        // The reader changed while we asked: the subscription re-runs this.
        if (cancelled || error instanceof IdentitySuperseded) return
        // `/api/me` answers 200 for a signed-out reader, so a 401 here is a
        // proxy's answer; still, it is the only failure that means "no session".
        setPhase(isUnauthenticated(error) ? 'anonymous' : 'unverified')
        return
      }

      if (cancelled) return

      if (!member) {
        setPhase('anonymous')
        return
      }

      setPhase('loading')

      try {
        const full = await get<T>(
          `/api/public/articles/full?type=${type}&id=${encodeURIComponent(String(articleId))}` +
            `&lang=${encodeURIComponent(lang ?? 'en')}`,
          { signal: controller.signal },
        )
        if (cancelled) return

        setData(full)
        setPhase('ready')
      } catch (error) {
        if (cancelled) return
        if (error instanceof RequestError && error.category === 'aborted') return
        if (isUnauthenticated(error)) {
          // The session ended between the two requests. Tell everyone.
          identityStore.invalidate()
          return
        }
        if (error instanceof RequestError && error.status === 403 && error.category === 'http') {
          // Membership lapsed since identity was read.
          setPhase('anonymous')
          return
        }
        // A member whose fetch failed is not a non-member. Falling through to
        // the notice would tell someone who paid that they had not.
        setPhase('failed')
      }
    }

    void run()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [articleId, type, lang, enabled, attempt, reader])

  return { phase, data, retry }
}
