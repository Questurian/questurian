import type { JSX } from 'react'
import { MapPin } from 'lucide-react'
import { ShimmerImage } from '@/components/media/ShimmerImage'
import { InstagramEmbedBlock } from '@/features/articles/components/InstagramEmbedBlock'
import { useListicleMapSync } from '@/features/articles/components/ListicleMapSync'
import {
  buildStayAmenitiesCell,
  ItineraryStayBookingCard,
  ItineraryStayVibeRow,
} from '@/features/articles/components/ItineraryStayDetails'
import { ListicleVenueInfoGrid } from '@/features/articles/components/ListicleVenueInfoGrid'
import { listicleInstagramEmbedCode } from '@/features/articles/lib/listicleInstagram'
import { listicleItemHeroFromRow } from '@/features/articles/lib/listicleItemHelpers'
import {
  formatListicleAddressLabel,
  isHttpUrl,
} from '@/features/articles/lib/listicleVenueFormatters'
import type { ListicleItemRow } from '@/features/articles/types/mapsListicle'

/**
 * Hand-drawn house glyph (SVG Repo "drawn-hand-house", CC0). Filled sketch
 * strokes render far thinner than the lucide House outline at large sizes.
 */
function DrawnHouseIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M35.434,40.904H13.381c-0.553,0-1-0.447-1-1v-14.96l-1.7,1.451c-0.347,0.295-0.846,0.319-1.218,0.062l-3.217-2.223 c-0.253-0.174-0.411-0.455-0.43-0.762s0.104-0.604,0.334-0.809L23.233,7.493c0.374-0.333,0.936-0.337,1.315-0.011l17.288,14.852 c0.235,0.202,0.363,0.501,0.348,0.811c-0.017,0.309-0.175,0.593-0.429,0.77l-3.231,2.246c-0.367,0.254-0.861,0.235-1.208-0.051 l-0.582-0.481c-0.14,0.562-0.267,1.094-0.273,1.589c-0.043,3.077-0.037,6.097-0.031,9.294l0.005,3.394 C36.434,40.457,35.986,40.904,35.434,40.904z M14.381,38.904h20.051l-0.004-2.39c-0.006-3.205-0.012-6.232,0.031-9.325 c0.011-0.754,0.187-1.458,0.356-2.139c0.069-0.278,0.14-0.557,0.195-0.836c0-0.004,0.001-0.007,0.002-0.011l-11.197-9.266 l-9.436,8.153V38.904z M8.432,23.313l1.535,1.062l2.485-2.12c0.002-0.002,0.004-0.004,0.006-0.006 c0.06-0.141,0.15-0.269,0.27-0.371l10.421-9.006c0.372-0.318,0.916-0.324,1.292-0.014l13.565,11.226l1.547-1.075L23.908,9.569 L8.432,23.313z" />
      <path d="M13.938,17.594c-0.498,0-0.929-0.371-0.991-0.877l-1.019-8.235c-0.035-0.285,0.053-0.57,0.243-0.785 c0.189-0.215,0.463-0.338,0.749-0.338h4.403c0.459,0,0.859,0.313,0.97,0.758l1.082,4.327c0.135,0.535-0.191,1.078-0.728,1.212 s-1.078-0.191-1.212-0.728l-0.893-3.569h-2.492l0.88,7.112c0.068,0.549-0.321,1.048-0.869,1.115 C14.02,17.592,13.979,17.594,13.938,17.594z" />
      <path d="M28.037,33.646h-7.378c-0.489,0-0.906-0.354-0.986-0.837l-0.263-1.602c-0.197-1.215-0.388-2.383-0.599-3.547 c-0.365-2.027,0.569-3.519,2.631-4.2c0.151-0.051,0.307-0.063,0.454-0.041c0.045-0.007,0.092-0.01,0.139-0.01h6.002 c0.553,0,1,0.447,1,1v8.236C29.037,33.199,28.59,33.646,28.037,33.646z M21.508,31.646h5.529V25.41h-5.002 c-0.032,0-0.064-0.002-0.097-0.005c-1.169,0.426-1.313,1.046-1.158,1.899c0.213,1.176,0.404,2.355,0.604,3.583L21.508,31.646z" />
    </svg>
  )
}

/**
 * Full "home base" entry for the itinerary's where-staying venue. Follows the
 * same editorial format as the numbered stops, but leads with a House badge
 * where the others carry a number. Echoes the house pin on the map and
 * registers with the scroll sync so passing it highlights that pin.
 */
export function ItineraryStayCard({ row }: { row: ListicleItemRow }): JSX.Element {
  const { registerEntry } = useListicleMapSync()
  const hero = listicleItemHeroFromRow(row)
  const addressRaw = typeof row.item.address === 'string' ? row.item.address.trim() : ''
  const addressLabel = formatListicleAddressLabel(addressRaw, row.item.title)
  const addressIsMapLink = addressRaw ? isHttpUrl(addressRaw) : false
  const blurb = row.blurb
  const instagramCode = listicleInstagramEmbedCode(row)
  const amenitiesCell = buildStayAmenitiesCell(row.item)

  return (
    <div
      ref={(el) => {
        registerEntry(row.id, el)
      }}
      className="min-w-0 scroll-mt-4 space-y-3 380:space-y-3.5 480:space-y-4 sm:space-y-5"
    >
      <div className="flex items-center gap-2.5 380:gap-3 480:gap-3.5">
        <DrawnHouseIcon className="size-[28px] shrink-0 text-foreground/40 380:size-[32px] 480:size-[38px] sm:size-[42px]" />
        <span className="text-[13px] font-bold uppercase leading-none tracking-[0.16em] text-foreground/55 [font-family:var(--font-dm-sans)] 380:text-[14px] 480:text-[16px] sm:text-[17px]">
          Where you&apos;re staying
        </span>
      </div>

      {hero ? (
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
        <h2 className="font-display text-[1.15rem] font-semibold leading-[1.2] text-foreground 380:text-[1.35rem] 480:text-[1.5rem] 550:text-[1.55rem] sm:text-[1.7rem] 768:text-[1.8rem]">
          {row.item.title}
        </h2>

        {addressRaw ? (
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

        <ItineraryStayVibeRow item={row.item} />
      </div>

      {blurb ? (
        <div
          className="article-prose maps-listicle-blurb maps-listicle-venue-blurb max-w-none pb-1"
          dangerouslySetInnerHTML={{ __html: blurb }}
        />
      ) : null}

      <ListicleVenueInfoGrid item={row.item} extraCells={amenitiesCell ? [amenitiesCell] : []} />

      <ItineraryStayBookingCard item={row.item} />

      {instagramCode ? (
        <div className="-mx-1 flex w-full min-w-0 justify-center pt-1 480:pt-2 sm:pt-3">
          <InstagramEmbedBlock
            embedCode={instagramCode}
            captionMode="hide"
            eager
            className="w-full max-w-[540px]"
          />
        </div>
      ) : null}
    </div>
  )
}
