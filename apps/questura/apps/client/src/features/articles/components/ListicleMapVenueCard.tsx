'use client'

import { useEffect, useState, type JSX } from 'react'
import { CalendarCheck, ChevronDown, ChevronRight, Ticket } from 'lucide-react'
import { ShimmerImage } from '@/components/media/ShimmerImage'
import type { ListicleMapPoint } from '@/features/articles/components/ListicleMapSync'

type ListicleMapVenueCardProps = {
  point: ListicleMapPoint
  position: number
  total: number
  onOpen: () => void
}

/**
 * The active stop, floated over the map takeover.
 *
 * The takeover hides the reading column entirely, so this card is the only
 * thing naming what a pin is - it carries the same photo, address and opening
 * words the entry does, and hands the reader back to that entry.
 *
 * One control, not a card with a link inside it: the whole box is the button,
 * and the rail at the foot is its label. Nesting a second button inside a
 * clickable card produces markup no screen reader can describe - which is why
 * booking sits in a sibling row below the card rather than inside it.
 *
 * That row holds up to two things. Reserve is a single link, so it is the
 * button itself; Tours & tickets is a list, so it collapses behind a count and
 * opens as a horizontal slider - a stop can carry four, and four booking cards
 * stacked over the map would leave no map. Whichever control is alone takes
 * the whole row.
 */
export function ListicleMapVenueCard({
  point,
  position,
  total,
  onOpen,
}: ListicleMapVenueCardProps): JSX.Element {
  const preview = point.preview
  const image = preview?.image ?? null
  const reserveHref = preview?.reserveHref ?? null
  const tours = preview?.tours ?? []
  const [toursOpen, setToursOpen] = useState(false)

  // A different stop is a different offer; never inherit the last one's state.
  useEffect(() => setToursOpen(false), [point.id])

  return (
    <div className="pointer-events-auto flex w-full max-w-[520px] flex-col gap-1.5">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Read the full entry for ${point.title}`}
        className="w-full overflow-hidden rounded-sm border border-foreground/20 bg-paper text-left shadow-[0_10px_30px_rgba(26,26,26,0.22)]"
      >
        <span className="flex items-start gap-3 p-3.5 480:gap-4 480:p-4">
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase leading-none tracking-[0.18em] text-accent">
                {String(position).padStart(2, '0')} / {String(total).padStart(2, '0')}
              </span>
              <span aria-hidden="true" className="h-px flex-1 bg-foreground/20" />
            </span>

            <span className="mt-2 block font-editorial text-[17px] font-bold leading-tight text-foreground 480:text-[19px]">
              {point.title}
            </span>

            {preview?.address ? (
              <span className="mt-1.5 block truncate text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-foreground/55">
                {preview.address}
              </span>
            ) : null}

            {preview?.excerpt ? (
              <span className="mt-2 line-clamp-2 block text-[13px] leading-snug text-foreground/75">
                {preview.excerpt}
              </span>
            ) : null}
          </span>

          {image ? (
            <span className="block size-[76px] shrink-0 overflow-hidden rounded-sm border border-foreground/15 480:size-[88px]">
              <ShimmerImage
                src={image.url}
                alt={image.alt}
                width={176}
                height={176}
                sizes="88px"
                className="h-full w-full object-cover"
                wrapperClassName="h-full w-full"
                loading="lazy"
              />
            </span>
          ) : null}
        </span>

        <span className="flex items-center justify-center gap-1.5 border-t border-foreground/20 bg-paper-accent px-3 py-2.5 text-[11px] font-bold uppercase leading-none tracking-[0.16em] text-accent">
          Read full entry
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </span>
      </button>

      {reserveHref || tours.length > 0 ? (
        <div className="flex items-stretch gap-1.5">
          {reserveHref ? (
            <a
              href={reserveHref}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center justify-center gap-2 rounded-sm border border-foreground/20 bg-accent px-3.5 py-2.5 text-[11px] font-bold uppercase leading-none tracking-[0.14em] text-white shadow-[0_10px_30px_rgba(26,26,26,0.22)] ${
                tours.length > 0 ? 'shrink-0' : 'w-full'
              }`}
            >
              <CalendarCheck className="size-[15px] shrink-0" aria-hidden="true" />
              Reserve
            </a>
          ) : null}

          {tours.length > 0 ? (
            <button
              type="button"
              aria-expanded={toursOpen}
              aria-controls={`map-tours-${point.id}`}
              onClick={() => setToursOpen((current) => !current)}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-sm border border-foreground/20 bg-paper px-3 py-2.5 text-[11px] font-bold uppercase leading-none tracking-[0.14em] text-foreground/70 shadow-[0_10px_30px_rgba(26,26,26,0.22)]"
            >
              <Ticket className="size-[15px] shrink-0 text-accent" aria-hidden="true" />
              <span className="truncate">Tours &amp; tickets</span>
              <span className="text-foreground/40">{tours.length}</span>
              <span aria-hidden="true" className="h-px flex-1 bg-foreground/15" />
              <ChevronDown
                className={`size-3.5 shrink-0 transition-transform ${
                  toursOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>
          ) : null}
        </div>
      ) : null}

      {toursOpen ? (
        <div
          id={`map-tours-${point.id}`}
          className="flex snap-x snap-mandatory gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5"
        >
          {tours.map((tour) => (
            <a
              key={tour.id}
              href={tour.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-2.5 rounded-sm border border-foreground/20 bg-paper p-2 shadow-[0_10px_30px_rgba(26,26,26,0.22)] ${
                tours.length === 1 ? 'w-full' : 'w-[212px] shrink-0 snap-start'
              }`}
            >
              {tour.image ? (
                <span className="block size-11 shrink-0 overflow-hidden rounded-sm bg-foreground/[0.06]">
                  <ShimmerImage
                    src={tour.image.url}
                    alt={tour.image.alt ?? tour.title}
                    width={96}
                    height={96}
                    sizes="44px"
                    className="h-full w-full object-cover"
                    wrapperClassName="h-full w-full"
                    loading="lazy"
                  />
                </span>
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block text-[12px] leading-snug text-foreground">
                  {tour.title}
                </span>
                {tour.price ? (
                  <span className="mt-1 block text-[11px] font-semibold leading-none text-accent">
                    {tour.price}
                  </span>
                ) : null}
              </span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  )
}
