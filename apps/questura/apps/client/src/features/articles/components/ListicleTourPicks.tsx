import type { JSX } from 'react'
import { Ticket } from 'lucide-react'
import { ShimmerImage } from '@/components/media/ShimmerImage'
import { renderableTourPicks } from '@/features/articles/lib/listicleTourPicks'
import type { ListicleTourPick } from '@/features/articles/types/mapsListicle'

/**
 * Booking affordance: a circular arrow whose ring draws itself on hover,
 * mirroring the plan cards on /join. The price already signals the action,
 * so the ring replaces an explicit "Book" label. The stroke colors and the
 * draw animation live in globals.css (`.listicle-tour-ring-*`).
 */
function TourBookRing(): JSX.Element {
  return (
    <span
      className="grid size-9 shrink-0 place-items-center self-center text-foreground/45 transition-colors group-hover:text-[var(--maps-listicle-accent)] group-focus-visible:text-[var(--maps-listicle-accent)] 480:size-10"
      aria-hidden
    >
      <svg viewBox="0 0 40 40" fill="none" className="h-full w-full">
        <circle className="listicle-tour-ring-track" cx="20" cy="20" r="18" strokeWidth="1.5" />
        <circle
          className="listicle-tour-ring-progress"
          cx="20"
          cy="20"
          r="18"
          pathLength="100"
          strokeWidth="1.5"
        />
        <path
          d="M14 20h11M20 15l5 5-5 5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

/**
 * Tour Picks (ADR 0013): the operator-curated tours for an attraction entry,
 * rendered as image booking cards beneath the editorial blurb. Tour data is live
 * from Location Manager → Payload.
 */
export function ListicleTourPicks({
  tours,
}: {
  tours: ListicleTourPick[] | null | undefined
}): JSX.Element | null {
  const rows = renderableTourPicks(tours)
  if (rows.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase leading-none tracking-[0.14em] text-foreground/70">
        <Ticket
          className="size-[15px] text-[var(--maps-listicle-accent)]"
          strokeWidth={2}
          aria-hidden
        />
        Tours &amp; tickets
      </div>
      <div className="grid grid-cols-1 gap-2.5">
        {rows.map((tour) => (
          <a
            key={tour.id}
            href={tour.href}
            target="_blank"
            rel="noopener noreferrer"
            className="listicle-tour-card group flex items-stretch gap-3 overflow-hidden rounded-sm border border-foreground/12 bg-foreground/[0.03] transition-colors hover:border-[var(--maps-listicle-accent)]/45 hover:bg-foreground/[0.06] focus-visible:border-[var(--maps-listicle-accent)] focus-visible:outline-none 480:gap-3.5"
          >
            {tour.image ? (
              <div className="aspect-square w-[88px] shrink-0 overflow-hidden bg-foreground/[0.06] 380:w-[96px] 480:w-[108px] sm:w-[120px]">
                <ShimmerImage
                  src={tour.image.url}
                  alt={tour.image.alt ?? tour.title}
                  width={tour.image.width ?? 240}
                  height={tour.image.height ?? 240}
                  sizes="120px"
                  className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04] motion-reduce:transform-none"
                  wrapperClassName="h-full w-full"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            ) : null}

            <div className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-3 480:py-3">
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 480:gap-2">
                <span className="line-clamp-2 break-words text-[12.5px] font-normal leading-snug text-foreground 480:text-[13.5px] sm:text-[14px]">
                  {tour.title}
                </span>
                {tour.price ? (
                  <span className="text-[12px] font-semibold leading-none text-[var(--maps-listicle-accent)] 480:text-[13px]">
                    {tour.price}
                  </span>
                ) : null}
              </div>
              <TourBookRing />
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
