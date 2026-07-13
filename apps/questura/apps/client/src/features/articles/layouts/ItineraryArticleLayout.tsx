'use client'

import { useMemo, useState, type JSX } from 'react'
import { ItineraryListicleArticlePage } from '@/features/articles/ItineraryListicleArticlePage'
import {
  ListicleMapSyncProvider,
  type ListicleMapPoint,
} from '@/features/articles/components/ListicleMapSync'
import { ListicleArticleLayout } from '@/features/articles/layouts/ListicleArticleLayout'
import {
  isTourAgencyBlock,
  itineraryDaysForArticle,
  populatedVenueStops,
  venueRowFromBlock,
} from '@/features/articles/lib/itineraryDays'
import type { RelatedMapsArticleTeaser } from '@/features/articles/lib/fetchRelatedMapsArticles'
import type { ListicleItineraryArticle } from '@/features/articles/types/itineraryListicle'

interface ItineraryArticleLayoutProps {
  article: ListicleItineraryArticle
  relatedArticles: RelatedMapsArticleTeaser[]
  country: string
  city?: string | null
}

export function ItineraryArticleLayout({
  article,
  relatedArticles,
  country,
  city,
}: ItineraryArticleLayoutProps): JSX.Element {
  const days = useMemo(() => itineraryDaysForArticle(article), [article])
  const [selectedDayIndex, setSelectedDayIndex] = useState(0)
  const dayIndex = Math.min(selectedDayIndex, Math.max(days.length - 1, 0))

  // Map shows the selected day only: pins swap and the map re-fits on day
  // change. Row ids must match what the entries register with the scroll
  // sync, so rows are built through the same helpers the page uses.
  const points = useMemo(() => {
    const day = days[dayIndex] ?? { whereStaying: [], items: [] }
    const result: ListicleMapPoint[] = []

    populatedVenueStops(day.whereStaying).forEach((row, index) => {
      const { latitude, longitude, title } = row.item
      if (typeof latitude !== 'number' || typeof longitude !== 'number') return
      result.push({ id: row.id, index, title, lat: latitude, lng: longitude, kind: 'stay' })
    })

    // Tour-agency stops occupy a slot in the on-page numbering but have no
    // coordinates, so pin numbers come from the list position, not from a
    // count of pinned venues.
    ;(day.items ?? []).forEach((block, index) => {
      if (isTourAgencyBlock(block)) return
      const row = venueRowFromBlock(block, `${block.blockType}-${index}`)
      if (!row) return
      const { latitude, longitude, title } = row.item
      if (typeof latitude !== 'number' || typeof longitude !== 'number') return
      result.push({ id: row.id, index, title, lat: latitude, lng: longitude, kind: 'stop' })
    })

    return result
  }, [days, dayIndex])

  return (
    <ListicleMapSyncProvider points={points}>
      <ListicleArticleLayout
        relatedArticles={relatedArticles}
        country={country}
        city={city}
      >
        <ItineraryListicleArticlePage
          article={article}
          days={days}
          selectedDayIndex={dayIndex}
          onSelectDay={setSelectedDayIndex}
        />
      </ListicleArticleLayout>
    </ListicleMapSyncProvider>
  )
}
