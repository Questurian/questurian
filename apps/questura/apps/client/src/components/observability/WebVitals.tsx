'use client'

import { useEffect } from 'react'
import { useReportWebVitals } from 'next/web-vitals'

import { getBackendUrl } from '@/lib/api/api-config'
import { createVitalsBatcher } from '@/lib/observability/webVitals'

/**
 * Real readers' page speed (launch fix plan item 13): Next's own
 * `useReportWebVitals`, batched and posted to the API's `/api/web-vitals` when
 * the page is hidden. Mounted once in the root layout; renders nothing.
 * Production only, like the error reporter.
 */

type Batcher = ReturnType<typeof createVitalsBatcher>
let batcher: Batcher | null = null

function batcherForThisLoad(): Batcher | null {
  if (process.env.NODE_ENV !== 'production' || typeof window === 'undefined') return null
  try {
    batcher ??= createVitalsBatcher({
      backendUrl: getBackendUrl(),
      path: window.location.pathname,
      release: process.env.NEXT_PUBLIC_QUESTURA_RELEASE_SHA,
    })
  } catch {
    return null
  }
  return batcher
}

// Module level, so the callback is stable and each metric is registered once.
function report(metric: { name: string; value: number; rating?: string; navigationType?: string }) {
  batcherForThisLoad()?.add(metric)
}

export function WebVitals() {
  useReportWebVitals(report)

  useEffect(() => {
    const flush = () => batcherForThisLoad()?.flush()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

  return null
}
