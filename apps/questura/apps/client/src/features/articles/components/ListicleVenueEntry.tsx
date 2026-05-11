import type { JSX } from 'react'
import { MapPin } from 'lucide-react'
import { InstagramEmbedBlock } from '@/features/articles/components/InstagramEmbedBlock'
import { ListicleVenueInfoGrid } from '@/features/articles/components/ListicleVenueInfoGrid'
import {
  listicleItemHeroFromRow,
  priceLevelLabel,
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

export function ListicleVenueEntry({
  row,
  index,
}: {
  row: ListicleItemRow
  index: number
}): JSX.Element {
  const hero = listicleItemHeroFromRow(row)
  const price = priceLevelLabel(row.item.priceLevel)
  const cuisines = stringArray(row.item.cuisines)
  const idealFor = stringArray(row.item.idealFor)
  const blurb = row.blurb
  const instagramCode = listicleInstagramEmbedCode(row)
  const addressRaw = typeof row.item.address === 'string' ? row.item.address.trim() : ''
  const addressLabel = formatListicleAddressLabel(addressRaw, row.item.title)
  const addressIsMapLink = addressRaw ? isHttpUrl(addressRaw) : false

  const metaParts = [
    price,
    cuisines[0],
    cuisines[1],
  ].filter((p): p is string => typeof p === 'string' && p.length > 0)

  return (
    <li className="scroll-mt-4 border-t-[3px] border-double border-foreground/55 first:border-t-0 first:pt-0 pt-7 pb-7 last:pb-1 max-[379px]:pt-6 max-[379px]:pb-6 480:pt-9 480:pb-9 550:pt-11 550:pb-11 sm:pt-12 sm:pb-12 768:pt-14 768:pb-14">
      <div className="min-w-0 space-y-3 380:space-y-3.5 480:space-y-4 sm:space-y-5">
        {hero ? (
          <div className="overflow-hidden rounded-sm bg-foreground/[0.04]">
            <div className="aspect-[16/10] w-full 380:aspect-[4/3] 480:aspect-[3/2] sm:aspect-[16/9]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={hero.url}
                alt={hero.alt}
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

          {idealFor.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-1 380:gap-2">
              <span className="inline-flex h-7 shrink-0 items-center justify-center px-2.5 text-center text-[9px] font-bold uppercase leading-none tracking-[0.16em] text-white rounded-none bg-[var(--maps-listicle-accent)] 380:h-8 380:px-3 380:text-[10px] 480:px-3.5 480:text-[11px]">
                Ideal for
              </span>
              {idealFor.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex min-h-7 max-w-full min-w-0 items-center justify-center px-2.5 text-center text-[9px] font-semibold leading-none text-foreground/80 rounded-none bg-[var(--maps-listicle-chip)] [overflow-wrap:anywhere] 380:min-h-8 380:px-3 380:text-[10px] 480:px-3.5 480:text-[11px] sm:whitespace-nowrap"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {blurb ? (
          <div
            className="article-prose maps-listicle-blurb maps-listicle-venue-blurb max-w-none pb-1"
            dangerouslySetInnerHTML={{ __html: blurb }}
          />
        ) : null}

        <ListicleVenueInfoGrid item={row.item} />

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
