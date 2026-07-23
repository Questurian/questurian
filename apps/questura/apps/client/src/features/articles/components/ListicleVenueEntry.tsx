import { useCallback, type JSX } from 'react'
import { MapPin } from 'lucide-react'
import { ShimmerImage } from '@/components/media/ShimmerImage'
import { InstagramEmbedBlock } from '@/features/articles/components/InstagramEmbedBlock'
import { useListicleMapSync } from '@/features/articles/components/ListicleMapSync'
import { ListiclePhotoCarousel } from '@/features/articles/components/ListiclePhotoCarousel'
import { ListicleTourPicks } from '@/features/articles/components/ListicleTourPicks'
import { ListicleVenueInfoGrid } from '@/features/articles/components/ListicleVenueInfoGrid'
import { ListicleVenueTitleRow } from '@/features/articles/components/ListicleVenueTitleRow'
import {
  listicleItemImagesFromRow,
  priceLevelLabel,
  priceTierDescriptor,
} from '@/features/articles/lib/listicleItemHelpers'
import { listicleInstagramEmbedCode } from '@/features/articles/lib/listicleInstagram'
import {
  formatListicleAddressLabel,
  isHttpUrl,
} from '@/features/articles/lib/listicleVenueFormatters'
import type { ListicleItemRow } from '@/features/articles/types/mapsListicle'

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function ListicleVenueEntry({
  row,
  index,
  variant = 'numbered',
}: {
  row: ListicleItemRow
  index: number
  variant?: 'numbered' | 'itinerary'
}): JSX.Element {
  const { registerEntry } = useListicleMapSync()
  const images = listicleItemImagesFromRow(row)
  const price = priceLevelLabel(row.item.priceLevel)
  const cuisines = stringArray(row.item.cuisines)
  const idealFor = stringArray(row.item.idealFor)
  const blurb = row.blurb
  const instagramCode = listicleInstagramEmbedCode(row)
  const addressRaw = typeof row.item.address === 'string' ? row.item.address.trim() : ''
  const addressLabel = formatListicleAddressLabel(addressRaw, row.item.title)
  const addressIsMapLink = addressRaw ? isHttpUrl(addressRaw) : false
  const isItinerary = variant === 'itinerary'
  const hero = images[0] ?? null
  const diningPriceLevel =
    isItinerary && row.blockType === 'itinerary-dining' && price ? price.length : null
  const entryRef = useCallback(
    (el: HTMLLIElement | null) => registerEntry(row.id, el),
    [registerEntry, row.id],
  )

  const metaParts = (
    isItinerary
      ? // Itineraries omit both price and cuisines from the meta line.
        []
      : [price, cuisines[0], cuisines[1]]
  ).filter((p): p is string => typeof p === 'string' && p.length > 0)

  const idealForRow = idealFor.length > 0 ? (
    <div className="flex flex-wrap gap-1.5 pt-1 380:gap-2">
      <span className="inline-flex h-7 shrink-0 items-center justify-center rounded-none bg-[var(--maps-listicle-accent)] px-2.5 text-center text-[9px] font-bold uppercase leading-none tracking-[0.16em] text-white 380:h-8 380:px-3 380:text-[10px] 480:px-3.5 480:text-[11px]">
        Ideal for
      </span>
      {idealFor.map((tag) => (
        <span
          key={tag}
          className="inline-flex min-h-7 max-w-full min-w-0 items-center justify-center rounded-none bg-[var(--maps-listicle-chip)] px-2.5 text-center text-[9px] font-semibold leading-none text-foreground/80 [overflow-wrap:anywhere] 380:min-h-8 380:px-3 380:text-[10px] 480:px-3.5 480:text-[11px] sm:whitespace-nowrap"
        >
          {tag}
        </span>
      ))}
    </div>
  ) : null

  // On itineraries the "Ideal for" line reads as the closing sentence of the
  // blurb: it is appended into the same prose block so it inherits the exact
  // font, size and paragraph spacing rather than sitting apart as chips.
  const idealForProse =
    isItinerary && idealFor.length > 0
      ? `<p class="maps-listicle-ideal-for"><strong>Ideal for:</strong> ${idealFor
          .map(escapeHtml)
          .join(', ')}</p>`
      : ''
  const itineraryBlurbHtml =
    isItinerary && (blurb || idealForProse) ? `${blurb ?? ''}${idealForProse}` : null

  return (
    <li
      ref={entryRef}
      className="scroll-mt-4 border-t-[3px] border-double border-foreground/55 first:border-t-0 first:pt-0 pt-7 pb-7 last:pb-1 max-[379px]:pt-6 max-[379px]:pb-6 480:pt-9 480:pb-9 550:pt-11 550:pb-11 sm:pt-12 sm:pb-12 768:pt-14 768:pb-14">
      <div className="min-w-0 space-y-3 380:space-y-3.5 480:space-y-4 sm:space-y-5">
        {isItinerary ? (
          <ListiclePhotoCarousel images={images} />
        ) : hero ? (
          <div className="overflow-hidden rounded-sm bg-foreground/[0.04]">
            <div className="aspect-[16/10] w-full 380:aspect-[4/3] 480:aspect-[3/2] sm:aspect-[16/9]">
              <ShimmerImage
                src={hero.url}
                alt={hero.alt}
                width={1200}
                height={675}
                sizes="(min-width: 768px) 700px, 100vw"
                className="h-full w-full object-cover"
                wrapperClassName="h-full w-full"
              />
            </div>
          </div>
        ) : null}

        <div className="space-y-2 480:space-y-2.5 sm:space-y-3">
          {isItinerary ? (
            <ListicleVenueTitleRow
              title={row.item.title}
              priceLevel={diningPriceLevel}
              priceDescriptor={priceTierDescriptor(diningPriceLevel)}
            />
          ) : (
            <h2 className="font-display text-[1.15rem] font-semibold leading-[1.2] text-foreground 380:text-[1.35rem] 480:text-[1.5rem] 550:text-[1.55rem] sm:text-[1.7rem] 768:text-[1.8rem]">
              <span className="font-semibold text-foreground">
                {index + 1}.
              </span>{' '}
              {row.item.title}
            </h2>
          )}

          {!isItinerary && addressRaw ? (
            <div className="maps-listicle-address-row">
              <MapPin
                className="maps-listicle-address-icon"
                strokeWidth={1.75}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                {addressIsMapLink ? (
                  <a
                    href={addressRaw}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="maps-listicle-address-link"
                  >
                    {addressLabel ?? 'Directions'}
                  </a>
                ) : (
                  <span className="maps-listicle-address-text">
                    {addressLabel ?? addressRaw}
                  </span>
                )}
              </div>
            </div>
          ) : null}

          {metaParts.length > 0 ? (
            <p className="maps-listicle-meta-row">
              {metaParts.map((part, i) => (
                <span key={`${part}-${i}`} className="maps-listicle-meta-item">
                  {i > 0 ? <span className="maps-listicle-meta-separator" aria-hidden /> : null}
                  <span className="maps-listicle-meta-value">
                    {part}
                  </span>
                </span>
              ))}
            </p>
          ) : null}

          {!isItinerary ? idealForRow : null}
        </div>

        {isItinerary ? (
          itineraryBlurbHtml ? (
            <div
              className="article-prose maps-listicle-blurb maps-listicle-venue-blurb max-w-none pb-1"
              dangerouslySetInnerHTML={{ __html: itineraryBlurbHtml }}
            />
          ) : null
        ) : blurb ? (
          <div
            className="article-prose maps-listicle-blurb maps-listicle-venue-blurb max-w-none pb-1"
            dangerouslySetInnerHTML={{ __html: blurb }}
          />
        ) : null}

        <ListicleTourPicks tours={row.tours} />

        <ListicleVenueInfoGrid
          item={row.item}
          variant={isItinerary ? 'list' : 'grid'}
          actionVariant={isItinerary ? 'editorial' : 'card'}
        />

        {instagramCode ? (
          <div className="-mx-1 flex w-full min-w-0 justify-center pt-1 480:pt-2 sm:pt-3">
            {/* First entries render eagerly; the rest pre-load in the
                background a couple at a time (InstagramEmbedBlock warm-up
                queue) so they're ready before the reader reaches them. */}
            <InstagramEmbedBlock
              embedCode={instagramCode}
              captionMode="hide"
              eager={index < 2}
              className="w-full max-w-[540px]"
            />
          </div>
        ) : null}
      </div>
    </li>
  )
}
