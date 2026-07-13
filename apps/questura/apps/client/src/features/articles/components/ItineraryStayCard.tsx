import type { JSX } from 'react'
import { House, MapPin } from 'lucide-react'
import { PublicImage } from '@/components/media/PublicImage'
import { useListicleMapSync } from '@/features/articles/components/ListicleMapSync'
import { listicleItemHeroFromRow } from '@/features/articles/lib/listicleItemHelpers'
import {
  formatListicleAddressLabel,
  isHttpUrl,
} from '@/features/articles/lib/listicleVenueFormatters'
import type { ListicleItemRow } from '@/features/articles/types/mapsListicle'

/**
 * Compact "home base" card for the itinerary's where-staying venue. Echoes
 * the house pin on the map and registers with the scroll sync so passing it
 * highlights that pin.
 */
export function ItineraryStayCard({ row }: { row: ListicleItemRow }): JSX.Element {
  const { registerEntry } = useListicleMapSync()
  const hero = listicleItemHeroFromRow(row)
  const addressRaw = typeof row.item.address === 'string' ? row.item.address.trim() : ''
  const addressLabel = formatListicleAddressLabel(addressRaw, row.item.title)
  const addressIsMapLink = addressRaw ? isHttpUrl(addressRaw) : false
  const blurb = row.blurb

  return (
    <div
      ref={(el) => {
        registerEntry(row.id, el)
      }}
      className="scroll-mt-4 overflow-hidden rounded-sm border border-foreground/12 bg-foreground/[0.04] sm:rounded"
    >
      <div className="flex items-stretch">
        {hero ? (
          <div className="w-[96px] shrink-0 self-stretch 380:w-[110px] 480:w-[132px] sm:w-[150px]">
            <PublicImage
              src={hero.url}
              alt={hero.alt}
              width={300}
              height={300}
              sizes="150px"
              className="h-full w-full object-cover"
            />
          </div>
        ) : null}

        <div className="min-w-0 flex-1 space-y-1.5 px-3 py-3 380:px-3.5 480:space-y-2 480:px-4 480:py-3.5 sm:px-5 sm:py-4">
          <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase leading-none tracking-[0.16em] text-[var(--maps-listicle-accent)] 380:text-[10px]">
            <House className="size-[13px] 480:size-[14px]" strokeWidth={2} aria-hidden />
            Where you&apos;re staying
          </div>

          <h2 className="font-display text-[1rem] font-semibold leading-[1.2] text-foreground 380:text-[1.1rem] 480:text-[1.2rem] sm:text-[1.3rem]">
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
        </div>
      </div>

      {blurb ? (
        <div className="border-t border-foreground/10 px-3 py-3 380:px-3.5 480:px-4 480:py-3.5 sm:px-5 sm:py-4">
          <div
            className="article-prose maps-listicle-blurb maps-listicle-venue-blurb max-w-none"
            dangerouslySetInnerHTML={{ __html: blurb }}
          />
        </div>
      ) : null}
    </div>
  )
}
