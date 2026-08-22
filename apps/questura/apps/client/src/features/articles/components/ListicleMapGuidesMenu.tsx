'use client'

import { useRef, useState, type JSX } from 'react'
import { ChevronDown, Compass } from 'lucide-react'
import Link from 'next/link'
import { ShimmerImage } from '@/components/media/ShimmerImage'
import type { RelatedMapsArticleTeaser } from '@/features/articles/lib/fetchRelatedMapsArticles'
import { relatedArticleHref } from '@/features/articles/lib/relatedArticleHref'
import { useMenuDismiss } from '@/features/articles/lib/useMenuDismiss'

export type ListicleMapGuides = {
  articles: RelatedMapsArticleTeaser[]
  country: string
  city?: string | null
}

/**
 * The related-guides shelf, folded into a menu that sits on the map.
 *
 * Desktop reads that shelf under the map column, but the phone's takeover
 * covers the page, so without this the map is a room with no other door: the
 * reader can step between pins and nowhere else. The menu ends with the
 * city (or country) hub so there is always a way out to more places, not just
 * to the handful of guides the article happens to link.
 *
 * The trigger's height is pinned to the stepper's button size so the two
 * pills sit level in the chrome cluster.
 */
export function ListicleMapGuidesMenu({
  articles,
  country,
  city,
}: ListicleMapGuides): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useMenuDismiss(open, () => setOpen(false), rootRef)

  const hubHref = city ? `/${country}/${city}` : `/${country}`
  const hubLabel = `All ${city ?? country} guides`.replace(/-/g, ' ')

  return (
    <div ref={rootRef} className="pointer-events-auto relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 items-center gap-1.5 rounded-full border border-foreground/15 bg-paper/95 pl-3 pr-2.5 1024:h-9 text-[11px] font-bold uppercase leading-none tracking-[0.12em] text-foreground/70 shadow-[0_4px_14px_rgba(26,26,26,0.16)] transition-colors hover:text-accent"
      >
        <Compass className="size-[15px] shrink-0" aria-hidden="true" />
        More guides
        <ChevronDown
          className={`size-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="More guides"
          className="absolute right-0 top-[calc(100%+8px)] z-20 max-h-[60vh] w-[264px] overflow-y-auto overscroll-contain rounded-xl border border-foreground/15 bg-paper p-1.5 shadow-[0_10px_30px_rgba(26,26,26,0.22)]"
        >
          {articles.map((article) => {
            const imageUrl = article.header?.featuredImage?.url ?? null
            const href = relatedArticleHref(article, country, city)

            return (
              <Link
                key={`${article.routeType}-${article.id}`}
                href={href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-paper-accent"
              >
                <span className="size-10 shrink-0 overflow-hidden rounded-sm bg-[#e5e0d8]">
                  {imageUrl ? (
                    <ShimmerImage
                      src={imageUrl}
                      alt={article.header?.featuredImage?.alt_text ?? ''}
                      width={80}
                      height={80}
                      sizes="40px"
                      className="h-full w-full object-cover"
                      wrapperClassName="h-full w-full"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 text-[0.72rem] font-medium leading-[1.25] text-foreground/70 transition-colors group-hover:text-foreground [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] [overflow-wrap:anywhere] overflow-hidden">
                  {article.title}
                </span>
              </Link>
            )
          })}

          <Link
            href={hubHref}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="mt-1 flex items-center justify-between gap-2 border-t border-foreground/12 px-2 pb-1 pt-2.5 text-[11px] font-bold uppercase leading-none tracking-[0.12em] text-accent"
          >
            <span className="truncate capitalize">{hubLabel}</span>
            <ChevronDown className="size-3.5 shrink-0 -rotate-90" aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </div>
  )
}
