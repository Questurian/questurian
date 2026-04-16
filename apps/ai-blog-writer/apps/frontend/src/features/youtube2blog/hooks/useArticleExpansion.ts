import { useCallback, useEffect, useRef, useState } from 'react'

import {
  detectArticleListicle,
  fetchExpandResult,
  fetchExpandStatus,
  startArticleExpansion,
} from '../api'
import type { ExpansionPhase, ListicleDetection } from '../types/youtube2blog.types'

type UseArticleExpansionReturn = {
  phase: ExpansionPhase
  expandedArticle: string | null
  expansionPlan: string | null
  error: string | null
  listicleDetection: ListicleDetection | null
  startExpansion: (article: string, articleType: string, title: string) => void
  proceedWithExpansion: (article: string, articleType: string, title: string, rewriteItems: string[] | null) => void
  reset: () => void
}

export function useArticleExpansion(runId: string | null): UseArticleExpansionReturn {
  const [phase, setPhase] = useState<ExpansionPhase>('idle')
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null)
  const [expansionPlan, setExpansionPlan] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandJobId, setExpandJobId] = useState<string | null>(null)
  const [listicleDetection, setListicleDetection] = useState<ListicleDetection | null>(null)

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      stopPolling()
    }
  }, [stopPolling])

  useEffect(() => {
    if (!expandJobId || phase === 'completed' || phase === 'error' || phase === 'idle') {
      return
    }

    stopPolling()

    const poll = async () => {
      try {
        const status = await fetchExpandStatus(expandJobId)

        if (status.state === 'running') {
          const stageToPhase: Record<string, ExpansionPhase> = {
            rewriting: 'rewriting',
            expanding: 'expanding',
            analyzing: 'analyzing',
          }
          setPhase(stageToPhase[status.stage] ?? 'analyzing')
          return
        }

        if (status.state === 'completed') {
          stopPolling()
          try {
            const result = await fetchExpandResult(expandJobId)
            setExpandedArticle(result.expanded_article)
            setExpansionPlan(result.expansion_plan)
            setPhase('completed')
          } catch (fetchErr) {
            setError(fetchErr instanceof Error ? fetchErr.message : 'Failed to fetch result')
            setPhase('error')
          }
          return
        }

        if (status.state === 'failed') {
          stopPolling()
          setError(status.error || 'Expansion failed')
          setPhase('error')
        }
      } catch (pollErr) {
        stopPolling()
        setError(pollErr instanceof Error ? pollErr.message : 'Polling failed')
        setPhase('error')
      }
    }

    poll()
    pollIntervalRef.current = setInterval(poll, 1500)

    return () => {
      stopPolling()
    }
  }, [expandJobId, phase, stopPolling])

  const _launchExpansion = useCallback(
    async (article: string, articleType: string, title: string, rewriteItems: string[] | null) => {
      if (!runId) return

      const nextPhase: ExpansionPhase = rewriteItems ? 'rewriting' : 'analyzing'
      setPhase(nextPhase)
      setError(null)
      setExpandedArticle(null)
      setExpansionPlan(null)
      setExpandJobId(null)

      try {
        const { expand_job_id } = await startArticleExpansion(
          runId,
          article,
          articleType,
          title,
          undefined,
          rewriteItems ?? undefined,
        )
        setExpandJobId(expand_job_id)
      } catch (startErr) {
        setError(startErr instanceof Error ? startErr.message : 'Failed to start expansion')
        setPhase('error')
      }
    },
    [runId],
  )

  const startExpansion = useCallback(
    async (article: string, articleType: string, title: string) => {
      if (!runId) return

      setPhase('detecting')
      setError(null)
      setExpandedArticle(null)
      setExpansionPlan(null)
      setExpandJobId(null)
      setListicleDetection(null)

      try {
        const detection = await detectArticleListicle(runId, article, title)

        if (!detection.is_listicle) {
          await _launchExpansion(article, articleType, title, null)
          return
        }

        setListicleDetection(detection)
        setPhase('personalizing')
      } catch {
        // Detection failure is non-fatal — fall through to standard expansion
        setListicleDetection(null)
        await _launchExpansion(article, articleType, title, null)
      }
    },
    [runId, _launchExpansion],
  )

  const proceedWithExpansion = useCallback(
    async (article: string, articleType: string, title: string, rewriteItems: string[] | null) => {
      await _launchExpansion(article, articleType, title, rewriteItems)
    },
    [_launchExpansion],
  )

  const reset = useCallback(() => {
    stopPolling()
    setPhase('idle')
    setExpandedArticle(null)
    setExpansionPlan(null)
    setError(null)
    setExpandJobId(null)
    setListicleDetection(null)
  }, [stopPolling])

  return {
    phase,
    expandedArticle,
    expansionPlan,
    error,
    listicleDetection,
    startExpansion,
    proceedWithExpansion,
    reset,
  }
}
