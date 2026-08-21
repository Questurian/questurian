'use client'

import type { JSX } from 'react'
import { ChevronRight } from 'lucide-react'
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
 * clickable card produces markup no screen reader can describe.
 */
export function ListicleMapVenueCard({
  point,
  position,
  total,
  onOpen,
}: ListicleMapVenueCardProps): JSX.Element {
  const preview = point.preview
  const image = preview?.image ?? null

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Read the full entry for ${point.title}`}
      className="pointer-events-auto w-full max-w-[520px] overflow-hidden rounded-sm border border-foreground/20 bg-paper text-left shadow-[0_10px_30px_rgba(26,26,26,0.22)]"
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
  )
}
