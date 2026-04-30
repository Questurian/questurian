'use client'

import { useEffect } from 'react'

import type { CityHomepageResponse } from '../types'

interface CityHomepagePayloadDebugLoggerProps {
  data: CityHomepageResponse
}

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
