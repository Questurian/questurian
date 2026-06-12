'use client'

import type { JSX } from 'react'
import { useMemo, useState } from 'react'
import { Clock, ExternalLink, MapPin, Route } from 'lucide-react'
import { ArticlePageHeader } from '@/features/articles/components/ArticlePageHeader'
import { InstagramEmbedBlock } from '@/features/articles/components/InstagramEmbedBlock'
import { ListicleSeparator } from '@/features/articles/components/ListicleSeparator'
import { ListicleVenueEntry } from '@/features/articles/components/ListicleVenueEntry'
import { isHttpUrl } from '@/features/articles/lib/listicleVenueFormatters'
import type {
  ItineraryDay,
  ItineraryStopBlock,
  ItineraryTourAgencyBlock,
  ItineraryTourAgencyKeyLocation,
  ItineraryVenueBlock,
  ListicleItineraryArticle,
} from '@/features/articles/types/itineraryListicle'
import {
  isListicleVenue,
  type ListicleItemRow,
} from '@/features/articles/types/mapsListicle'

type ItineraryListicleArticlePageProps = {
  article: ListicleItineraryArticle
}

function itineraryDaysForArticle(article: ListicleItineraryArticle): ItineraryDay[] {
  const days = article.itineraryDays?.filter(Boolean) ?? []
  if (days.length > 0) {
    return days
  }

  return [
    {
      id: 'legacy-single-day',
      whereStaying: article.whereStaying ?? [],
      items: article.items ?? [],
    },
  ]
}

function isTourAgencyBlock(
  block: ItineraryStopBlock,
): block is ItineraryTourAgencyBlock {
  return block.blockType === 'itinerary-tour-agency'
}

function venueRowFromBlock(
  block: ItineraryVenueBlock,
  fallbackId: string,
): ListicleItemRow | null {
  if (!isListicleVenue(block.item)) {
    return null
  }

  return {
    id: block.id ?? fallbackId,
    blurb: block.blurb,
    item: block.item,
    blockType: block.blockType,
    mediaMode: block.mediaMode,
    selectedPhotos: block.selectedPhotos ?? undefined,
    selectedInstagramPost: block.selectedInstagramPost,
    tours: block.tours,
  }
}

function populatedVenueStops(blocks: ItineraryVenueBlock[] | null | undefined): ListicleItemRow[] {
  return (blocks ?? [])
    .map((block, index) => venueRowFromBlock(block, `${block.blockType}-${index}`))
    .filter((row): row is ListicleItemRow => Boolean(row))
}

function formatDuration(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) {
    return 'Tour'
  }
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
}

function normalizedHref(url: string): string {
  const trimmed = url.trim()
  return isHttpUrl(trimmed) ? trimmed : `https://${trimmed}`
}

function keyLocationLabel(row: ItineraryTourAgencyKeyLocation): string | null {
  if (row.source === 'manual') {
    return typeof row.title === 'string' && row.title.trim() ? row.title.trim() : null
  }

  const value = row.relatedItem?.value
  return isListicleVenue(value) ? value.title : null
}

function TourAgencyCard({
  block,
  index,
}: {
  block: ItineraryTourAgencyBlock
  index: number
}): JSX.Element {
  const image = typeof block.image === 'object' && block.image !== null ? block.image : null
  const imageUrl = typeof image?.url === 'string' ? image.url : null
  const instagramCode =
    typeof block.instagramPost === 'object' && block.instagramPost !== null
      ? block.instagramPost.embedCode
      : null
  const startingPoint =
    typeof block.startingPoint?.label === 'string' && block.startingPoint.label.trim()
      ? block.startingPoint.label.trim()
      : null
  const keyLocations = (block.keyLocations ?? [])
    .map(keyLocationLabel)
    .filter((label): label is string => Boolean(label))
  const href = block.url ? normalizedHref(block.url) : null

  return (
    <li className="scroll-mt-4 border-t-[3px] border-double border-foreground/55 first:border-t-0 first:pt-0 pt-7 pb-7 last:pb-1 max-[379px]:pt-6 max-[379px]:pb-6 480:pt-9 480:pb-9 550:pt-11 550:pb-11 sm:pt-12 sm:pb-12 768:pt-14 768:pb-14">
      <div className="min-w-0 space-y-3 380:space-y-3.5 480:space-y-4 sm:space-y-5">
        {imageUrl ? (
          <div className="overflow-hidden rounded-sm bg-foreground/[0.04]">
            <div className="aspect-[16/10] w-full 380:aspect-[4/3] 480:aspect-[3/2] sm:aspect-[16/9]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={image?.alt_text ?? block.title}
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        ) : null}

        <div className="space-y-2 480:space-y-2.5 sm:space-y-3">
          <h2 className="font-display text-[1.15rem] font-semibold leading-[1.2] text-foreground 380:text-[1.35rem] 480:text-[1.5rem] 550:text-[1.55rem] sm:text-[1.7rem] 768:text-[1.8rem]">
            <span className="font-semibold text-foreground">
              {index + 1}.
            </span>{' '}
            {block.title}
          </h2>

          <p className="maps-listicle-meta-row">
            <span className="maps-listicle-meta-item">
              <span className="maps-listicle-meta-value">{block.operator}</span>
            </span>
            {block.price ? (
              <span className="maps-listicle-meta-item">
                <span className="maps-listicle-meta-separator" aria-hidden />
                <span className="maps-listicle-meta-value">{block.price}</span>
              </span>
            ) : null}
          </p>
        </div>

        <div className="overflow-hidden rounded-sm border border-foreground/12 bg-foreground/[0.07] sm:rounded">
          <div className="grid grid-cols-1 gap-px bg-foreground/12 480:grid-cols-2">
            <div className="maps-listicle-utility-cell flex items-center gap-2.5 px-3 py-2.5 380:px-3.5 480:gap-3 480:px-4 480:py-3 sm:px-4 sm:py-3.5 768:px-5 768:py-3.5">
              <Clock className="maps-listicle-info-icon text-[var(--maps-listicle-accent)] shrink-0 size-[15px] 480:size-[16px] sm:size-[17px]" strokeWidth={1.75} aria-hidden />
              <span className="maps-listicle-info-label break-words text-[12px] font-light leading-tight text-foreground/72 480:text-[13px] sm:text-[14px]">
                {formatDuration(block.tourDuration)}
              </span>
            </div>

            {startingPoint ? (
              <div className="maps-listicle-utility-cell flex items-center gap-2.5 px-3 py-2.5 380:px-3.5 480:gap-3 480:px-4 480:py-3 sm:px-4 sm:py-3.5 768:px-5 768:py-3.5">
                <MapPin className="maps-listicle-info-icon text-[var(--maps-listicle-accent)] shrink-0 size-[15px] 480:size-[16px] sm:size-[17px]" strokeWidth={1.75} aria-hidden />
                <span className="maps-listicle-info-label break-words text-[12px] font-light leading-tight text-foreground/72 480:text-[13px] sm:text-[14px]">
                  {startingPoint}
                </span>
              </div>
            ) : null}

            {href ? (
              <div className="maps-listicle-utility-cell flex items-center gap-2.5 px-3 py-2.5 380:px-3.5 480:col-span-2 480:gap-3 480:px-4 480:py-3 sm:px-4 sm:py-3.5 768:px-5 768:py-3.5">
                <ExternalLink className="maps-listicle-info-icon text-[var(--maps-listicle-accent)] shrink-0 size-[15px] 480:size-[16px] sm:size-[17px]" strokeWidth={1.75} aria-hidden />
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="maps-listicle-info-label break-words text-[12px] font-light leading-tight text-foreground/72 hover:text-foreground focus-visible:text-foreground focus-visible:outline-none 480:text-[13px] sm:text-[14px]"
                >
                  Book tour
                </a>
              </div>
            ) : null}
          </div>
        </div>

        {keyLocations.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase leading-none tracking-[0.16em] text-foreground/45">
              <Route className="size-[14px]" strokeWidth={1.8} aria-hidden />
              Route
            </div>
            <div className="flex flex-wrap gap-1.5 380:gap-2">
              {keyLocations.map((label) => (
                <span
                  key={label}
                  className="inline-flex min-h-7 max-w-full min-w-0 items-center justify-center px-2.5 text-center text-[9px] font-semibold leading-none text-foreground/80 rounded-none bg-[var(--maps-listicle-chip)] [overflow-wrap:anywhere] 380:min-h-8 380:px-3 380:text-[10px] 480:px-3.5 480:text-[11px]"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {block.blurb ? (
          <div
            className="article-prose maps-listicle-blurb maps-listicle-venue-blurb max-w-none pb-1"
            dangerouslySetInnerHTML={{ __html: block.blurb }}
          />
        ) : null}

        {instagramCode ? (
          <div className="-mx-1 flex w-full min-w-0 justify-center pt-1 480:pt-2 sm:pt-3">
            <InstagramEmbedBlock
              embedCode={instagramCode}
              captionMode="hide"
              className="w-full max-w-[540px]"
            />
          </div>
        ) : null}
      </div>
    </li>
  )
}

function StopList({ stops }: { stops: ItineraryStopBlock[] }): JSX.Element | null {
  if (stops.length === 0) return null

  return (
    <ol className="m-0 list-none p-0">
      {stops.map((block, index) => {
        if (isTourAgencyBlock(block)) {
          return (
            <TourAgencyCard
              key={block.id ?? `${block.blockType}-${index}`}
              block={block}
              index={index}
            />
          )
        }

        const row = venueRowFromBlock(block, `${block.blockType}-${index}`)
        if (!row) return null

        return (
          <ListicleVenueEntry
            key={row.id}
            row={row}
            index={index}
          />
        )
      })}
    </ol>
  )
}

export function ItineraryListicleArticlePage({
  article,
}: ItineraryListicleArticlePageProps): JSX.Element {
  const days = useMemo(() => itineraryDaysForArticle(article), [article])
  const [selectedDayIndex, setSelectedDayIndex] = useState(0)
  const dayIndex = Math.min(selectedDayIndex, Math.max(days.length - 1, 0))
  const selectedDay = days[dayIndex] ?? { whereStaying: [], items: [] }
  const whereStaying = populatedVenueStops(selectedDay.whereStaying)
  const stops = selectedDay.items ?? []
  const featuredImage = article.header?.featuredImage
  const introRaw = article.header?.intro
  const introHtml = typeof introRaw === 'string' ? introRaw : null
  const description = article.seoSection?.metaDescription

  return (
    <article className="maps-listicle-article min-h-screen bg-background sm:max-w-[600px] sm:mx-auto 1024:max-w-none 1024:mx-0">
      <ArticlePageHeader
        title={article.title}
        description={description}
        featuredImage={
          featuredImage?.url
            ? { url: featuredImage.url, alt: featuredImage.alt_text }
            : null
        }
        publishedAt={article.publishedAt ?? undefined}
        updatedAt={article.updatedAt}
        author={article.author}
      />

      {introHtml ? (
        <div className="px-3 pt-6 pb-2 380:px-4 380:pt-8 380:pb-3 480:px-5 480:pt-10 480:pb-4 550:px-6 sm:px-8 sm:pt-10 sm:pb-5 768:px-10">
          <div
            className="article-prose maps-listicle-intro max-w-none"
            dangerouslySetInnerHTML={{ __html: introHtml }}
          />
        </div>
      ) : null}

      <ListicleSeparator />

      {days.length > 1 ? (
        <div className="px-3 pt-5 380:px-4 480:px-5 550:px-6 sm:px-8 sm:pt-7 768:px-10">
          <div
            role="tablist"
            aria-label="Itinerary days"
            className="flex gap-1.5 overflow-x-auto border-b border-foreground/15 pb-2"
          >
            {days.map((day, index) => {
              const selected = index === dayIndex

              return (
                <button
                  key={day.id ?? `day-${index}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={`shrink-0 border px-3.5 py-2 text-[11px] font-bold uppercase leading-none tracking-[0.14em] transition-colors 480:px-4 480:text-[12px] ${
                    selected
                      ? 'border-[var(--maps-listicle-accent)] bg-[var(--maps-listicle-accent)] text-white'
                      : 'border-foreground/15 bg-background text-foreground/55 hover:border-foreground/35 hover:text-foreground'
                  }`}
                  onClick={() => setSelectedDayIndex(index)}
                >
                  Day {index + 1}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="px-3 pb-20 pt-4 380:px-4 380:pt-6 480:px-5 480:pt-8 480:pb-24 550:px-6 550:pt-10 sm:px-8 sm:pt-8 sm:pb-32 768:px-10">
        {whereStaying.length > 0 ? (
          <section className="mb-8 480:mb-10 sm:mb-12" aria-labelledby="where-staying-heading">
            <h2
              id="where-staying-heading"
              className="mb-4 font-display text-[1.35rem] font-semibold leading-tight text-foreground 480:mb-5 480:text-[1.5rem] sm:text-[1.7rem]"
            >
              Where you&apos;re staying
            </h2>
            <ol className="m-0 list-none p-0">
              {whereStaying.map((row, index) => (
                <ListicleVenueEntry key={row.id} row={row} index={index} />
              ))}
            </ol>
          </section>
        ) : null}

        {stops.length > 0 ? (
          <section aria-labelledby="stops-heading">
            <h2
              id="stops-heading"
              className="mb-4 font-display text-[1.35rem] font-semibold leading-tight text-foreground 480:mb-5 480:text-[1.5rem] sm:text-[1.7rem]"
            >
              Stops
            </h2>
            <StopList stops={stops} />
          </section>
        ) : null}
      </div>
    </article>
  )
}
