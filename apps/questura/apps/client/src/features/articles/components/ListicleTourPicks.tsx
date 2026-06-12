import type { JSX } from 'react'
import { ExternalLink, Ticket } from 'lucide-react'
import { isHttpUrl } from '@/features/articles/lib/listicleVenueFormatters'
import type { ListicleTourPick } from '@/features/articles/types/mapsListicle'

type RenderableTourPick = {
  id: number | string
  title: string
  price: string | null
  href: string
}

function renderableTourPicks(tours: ListicleTourPick[] | null | undefined): RenderableTourPick[] {
  return (tours ?? [])
    .map((tour, index): RenderableTourPick | null => {
      const title = typeof tour?.title === 'string' ? tour.title.trim() : ''
      const link = typeof tour?.bookingLink === 'string' ? tour.bookingLink.trim() : ''
      if (!title || !link) return null

      return {
        id: tour.id ?? `tour-${index}`,
        title,
        price: typeof tour.price === 'string' && tour.price.trim() ? tour.price.trim() : null,
        href: isHttpUrl(link) ? link : `https://${link}`,
      }
    })
    .filter((tour): tour is RenderableTourPick => Boolean(tour))
}

/**
 * Tour Picks (ADR 0013): the operator-curated tours for an attraction entry,
 * rendered as structured booking rows beneath the editorial blurb. Tour data
 * is live from Location Manager → Payload.
 */
export function ListicleTourPicks({
  tours,
}: {
  tours: ListicleTourPick[] | null | undefined
}): JSX.Element | null {
  const rows = renderableTourPicks(tours)
  if (rows.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase leading-none tracking-[0.16em] text-foreground/45">
        <Ticket className="size-[14px]" strokeWidth={1.8} aria-hidden />
        Tours
      </div>
      <div className="overflow-hidden rounded-sm border border-foreground/12 bg-foreground/[0.07] sm:rounded">
        <div className="grid grid-cols-1 gap-px bg-foreground/12">
          {rows.map((tour) => (
            <a
              key={tour.id}
              href={tour.href}
              target="_blank"
              rel="noopener noreferrer"
              className="maps-listicle-utility-cell flex items-center gap-2.5 bg-background px-3 py-2.5 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.04] focus-visible:outline-none 380:px-3.5 480:gap-3 480:px-4 480:py-3 sm:px-4 sm:py-3.5 768:px-5 768:py-3.5"
            >
              <span className="maps-listicle-info-label min-w-0 flex-1 break-words text-[12px] font-light leading-tight text-foreground/72 480:text-[13px] sm:text-[14px]">
                {tour.title}
              </span>
              {tour.price ? (
                <span className="shrink-0 text-[12px] font-semibold leading-none text-foreground/80 480:text-[13px]">
                  {tour.price}
                </span>
              ) : null}
              <ExternalLink
                className="maps-listicle-info-icon shrink-0 text-[var(--maps-listicle-accent)] size-[15px] 480:size-[16px] sm:size-[17px]"
                strokeWidth={1.75}
                aria-hidden
              />
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
