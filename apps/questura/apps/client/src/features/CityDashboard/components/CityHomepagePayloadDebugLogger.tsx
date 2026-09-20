'use client'

import { useEffect } from 'react'

import type { CityHomepageResponse } from '../types'

interface CityHomepagePayloadDebugLoggerProps {
  data: CityHomepageResponse
}

/**
 * Prints the city homepage payload to the browser console while developing.
 *
 * Render it behind a `process.env.NODE_ENV === 'development'` check at the
 * call site, not just here. The check below stops the logging, but it cannot
 * stop the shipping: React serializes a client component's props into the RSC
 * payload in the HTML before any of this code runs, so an internal-only guard
 * still sent the whole homepage response — the same bytes the server already
 * rendered into cards — to every production reader.
 */
export function CityHomepagePayloadDebugLogger({
  data,
}: CityHomepagePayloadDebugLoggerProps) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') {
      return
    }

    console.log('[Questura] City homepage Payload data', data)
  }, [data])

  return null
}
