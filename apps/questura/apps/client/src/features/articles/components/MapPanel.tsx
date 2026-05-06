'use client'

import { useEffect, useRef } from 'react'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'

const LIMA_CENTER = { lat: -12.0464, lng: -77.0428 }

export function MapPanel() {
  const mapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setOptions({
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
      version: 'weekly',
    })

    importLibrary('maps').then(({ Map }) => {
      if (!mapRef.current) return
      new Map(mapRef.current, {
        center: LIMA_CENTER,
        zoom: 13,
        mapId: 'questura-maps',
      })
    })
  }, [])

  return <div ref={mapRef} className="h-full w-full" />
}
