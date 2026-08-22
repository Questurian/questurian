import type { JSX } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { ShimmerImage } from '@/components/media/ShimmerImage'
import { editorialKickerClass } from '@/features/articles/components/EditorialRule'
import { InArticleAd } from '@/features/articles/components/InArticleAd'
import { ListicleSeparator } from '@/features/articles/components/ListicleSeparator'
import type {
  ListicleFooterLink,
  ListicleFooterLinks,
} from '@/features/articles/lib/fetchListicleFooterLinks'
import type { ArticleTypeKey } from '@/features/articles/lib/articleScope'

/**
 * The way out of a finished list.
 *
 * A listicle ends on its last venue and, until now, on nothing. This is the
 * foot: three illustrated cards mixing maps, itineraries and plain articles
 * for the same place, a short latest-reads rail, and the city hub as a final
 * door. Six links, deliberately -- the foot is an exit, not a second article.
 *
 * It sits below both columns rather than inside the reading column, because
 * the sticky map is bound by the list: map and list end together, and the
 * foot runs the full width under the pair.
 *
 * It is paper, not cards-on-cards: a label sitting on a rule, hairlines
 * between rows, the accent used only for the kickers and the hover state.
 */

type ListicleArticleFooterProps = {
  links: ListicleFooterLinks
  country: string
  city?: string | null
}

const KIND_LABEL: Record<ArticleTypeKey, string> = {
  maps: 'Map',
  itineraries: 'Itinerary',
  articles: 'Read',
}

function formatSegmentName(segment: string): string {
  return segment
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatShortDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
    .format(date)
    .toUpperCase()
}

function GuideCard({ link }: { link: ListicleFooterLink }): JSX.Element {
  return (
    <Link href={link.href} className="group block min-w-0">
      <article className="flex min-w-0 gap-3 480:block">
        <div className="h-[68px] w-[92px] shrink-0 overflow-hidden bg-[#e5e0d8] 480:h-auto 480:max-h-[220px] 480:w-full 480:aspect-[16/10]">
          {link.thumbnail?.url ? (
            <ShimmerImage
              src={link.thumbnail.url}
              alt={link.thumbnail.alt ?? ''}
              width={480}
              height={320}
              sizes="(min-width: 1024px) 240px, (min-width: 480px) 33vw, 92px"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
              wrapperClassName="h-full w-full"
              loading="lazy"
              decoding="async"
            />
          ) : null}
        </div>

        <div className="min-w-0 flex-1 480:pt-2.5">
          <span className={`${editorialKickerClass} block text-accent`}>
            {KIND_LABEL[link.kind]}
          </span>
          <h3 className="mt-1.5 font-display text-[15px] font-bold leading-[1.24] text-foreground transition-colors group-hover:text-accent 480:text-[16px] 768:text-[17px]">
            {link.title}
          </h3>
        </div>
      </article>
    </Link>
  )
}

function LatestRow({ link }: { link: ListicleFooterLink }): JSX.Element {
  const date = formatShortDate(link.publishedAt)

  return (
    <li className="border-t border-foreground/12 first:border-t-0">
      <Link href={link.href} className="group flex flex-col gap-1 py-3 first:pt-0 1024:py-4 1024:first:pt-0">
        {date ? (
          <span className={`${editorialKickerClass} text-foreground/45`}>{date}</span>
        ) : null}
        <span className="font-display text-[15px] font-bold leading-[1.28] text-foreground transition-colors group-hover:text-accent 480:text-[16px]">
          {link.title}
        </span>
      </Link>
    </li>
  )
}

export function ListicleArticleFooter({
  links,
  country,
  city,
}: ListicleArticleFooterProps): JSX.Element | null {
  const { guides, latest } = links
  if (guides.length === 0 && latest.length === 0) return null

  const placeLabel = formatSegmentName(city ?? country)
  const hubHref = city ? `/${country}/${city}` : `/${country}`

  return (
    <section
      aria-labelledby="listicle-more-heading"
      className="listicle-article-foot pb-16 480:pb-20 1024:pb-24"
    >
      {/* The same rail-diamond-rail the article uses between its own
          movements, rather than a hard border: the foot is the next
          movement, not a different object. */}
      <ListicleSeparator />

      <div className="px-3 pt-6 380:px-4 480:px-5 480:pt-8 550:px-6 sm:px-8 768:px-10 1024:pt-10">
        {/* The pause between the list and what comes next is where a reader
            already expects to stop, so the deeper unit sits here and the thin
            one closes the page. Both are exact IAB boxes reserved before
            load, so nothing shifts under the reader. */}
        <InArticleAd slotId="listicle-foot-top" variant="rectangle" />

        <div className="pt-8 480:pt-10 sm:pt-12 1024:pt-14 1024:grid 1024:grid-cols-[minmax(0,1fr)_320px] 1024:gap-x-10 1280:grid-cols-[minmax(0,1fr)_360px] 1280:gap-x-14">
          <div className="min-w-0">
            {guides.length > 0 ? (
              <>
                {/* Heading and the way out share a baseline: the link used to
                    hang below the cards, which left the column bottom-heavy
                    against the short rail. */}
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                  <h2
                    id="listicle-more-heading"
                    className="font-display text-[19px] font-bold leading-none text-foreground 480:text-[21px] 768:text-[23px]"
                  >
                    Explore{' '}
                    <span className="border-b-[3px] border-accent pb-0.5 text-accent">
                      More
                    </span>
                  </h2>

                  <Link
                    href={hubHref}
                    className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase leading-none tracking-[0.14em] text-foreground/55 transition-colors hover:text-accent 480:text-[11px]"
                  >
                    All {placeLabel} guides
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Link>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-5 480:grid-cols-3 480:gap-4 768:gap-6 1024:mt-6">
                  {guides.map((link) => (
                    <GuideCard key={link.id} link={link} />
                  ))}
                </div>
              </>
            ) : null}
          </div>

          {latest.length > 0 ? (
            <div
              className={`${guides.length > 0 ? 'mt-9 480:mt-11' : ''} 1024:mt-0 1024:border-l 1024:border-foreground/15 1024:pl-8`}
            >
              <div className="flex items-center gap-3">
                <h2
                  {...(guides.length === 0 ? { id: 'listicle-more-heading' } : {})}
                  className={`shrink-0 ${editorialKickerClass} text-accent`}
                >
                  Reading List
                </h2>
                <div aria-hidden="true" className="h-px min-w-8 flex-1 bg-foreground/18" />
              </div>

              <ul className="mt-3.5 m-0 list-none p-0">
                {latest.map((link) => (
                  <LatestRow key={link.id} link={link} />
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="pt-10 480:pt-12 1024:pt-14">
          <InArticleAd slotId="listicle-foot-banner" variant="banner" />
        </div>
      </div>
    </section>
  )
}
