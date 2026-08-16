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
import { GatedBodySkeleton, GatedLoadError } from '@/features/articles/components/GatedStates'
import { PaywallNotice } from '@/features/articles/components/PaywallNotice'
import { readGate } from '@/features/articles/lib/gate'
import { useGatedFullArticle } from '@/features/articles/lib/useGatedFullArticle'
import type { RelatedMapsArticleTeaser } from '@/features/articles/lib/fetchRelatedMapsArticles'
import type { ListicleItineraryArticle } from '@/features/articles/types/itineraryListicle'

interface ItineraryArticleLayoutProps {
  article: ListicleItineraryArticle
  relatedArticles: RelatedMapsArticleTeaser[]
  country: string
  city?: string | null
  /** Path the reader is on, so checkout can return them to it. */
  path?: string
}

export function ItineraryArticleLayout({
  article,
  relatedArticles,
  country,
  city,
  path,
}: ItineraryArticleLayoutProps): JSX.Element {
  const gate = readGate(article)
  const locked = gate?.locked === true

  // The swap happens here rather than deeper down because this is where days
  // are derived. A gated itinerary arrives with none, and a member's full body
  // has to re-enter through the same derivation so the day tabs, map pins and
  // scroll sync all agree.
  const { phase, data, retry } = useGatedFullArticle<ListicleItineraryArticle>({
    articleId: article.id,
    type: 'itineraries',
    enabled: locked,
  })

  const effectiveArticle = locked && phase === 'ready' && data ? data : article
  const days = useMemo(() => itineraryDaysForArticle(effectiveArticle), [effectiveArticle])
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
          article={effectiveArticle}
          days={days}
          selectedDayIndex={dayIndex}
          onSelectDay={setSelectedDayIndex}
          lockedSlot={
            locked && gate ? (
              phase === 'identifying' || phase === 'anonymous' ? (
                <PaywallNotice gate={gate} returnTo={path ?? '/'} />
              ) : phase === 'loading' ? (
                <GatedBodySkeleton />
              ) : phase === 'failed' ? (
                <GatedLoadError onRetry={retry} />
              ) : null
            ) : null
          }
        />
      </ListicleArticleLayout>
    </ListicleMapSyncProvider>
  )
}
