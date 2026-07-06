import Link from 'next/link'

import { PublicImage } from '@/components/media/PublicImage'
import type {
  ArticleSearchResponse,
  LocationContentItem,
  LocationContentResponse,
} from '@/features/search/lib/fetchSearch'

const TYPE_LABEL: Record<LocationContentItem['type'], string> = {
  articles: 'Article',
  maps: 'Map',
  itineraries: 'Itinerary',
}

function formatDate(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

type Props = {
  content: LocationContentResponse | ArticleSearchResponse
  /** Builds the href for a pagination link. Omit to hide pagination. */
  pageHref?: (page: number) => string
  emptyMessage?: string
}

export function LocationContentList({ content, pageHref, emptyMessage }: Props) {
  if (content.items.length === 0) {
    return (
      <p className="text-[15px] leading-7 text-foreground/60">
        {emptyMessage ?? (
          'location' in content
            ? `No published content for ${content.location.label} yet.`
            : 'No results yet.'
        )}
      </p>
    )
  }

  return (
    <div>
      <ul className="border-y border-foreground/18">
        {content.items.map((item) => (
          <li
            key={`${item.type}-${item.id}`}
            className="border-b border-foreground/14 last:border-b-0"
          >
            <Link
              href={item.href}
              className="group flex items-center gap-5 py-6 outline-none focus-visible:bg-foreground/5"
            >
              {item.thumbnail && (
                <div className="relative aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-md bg-foreground/5 480:w-36">
                  <PublicImage
                    src={item.thumbnail.url}
                    alt={item.thumbnail.alt ?? ''}
                    width={288}
                    height={216}
                    sizes="144px"
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                </div>
              )}
              <div className="min-w-0">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/55">
                  {TYPE_LABEL[item.type]}
                  {item.publishedAt && ` · ${formatDate(item.publishedAt)}`}
                </p>
                <h2 className="font-display text-[20px] leading-tight text-foreground 480:text-[24px]">
                  {item.title}
                </h2>
                {item.excerpt && (
                  <p className="mt-1.5 line-clamp-2 text-[14px] leading-6 text-foreground/68">
                    {item.excerpt}
                  </p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {pageHref && content.totalPages > 1 && (
        <nav
          aria-label="Pagination"
          className="mt-12 flex items-center justify-between border-t border-foreground/14 pt-6 text-[14px]"
        >
          <div>
            {content.hasPrev && (
              <Link href={pageHref(content.page - 1)} className="text-foreground/70 hover:text-foreground">
                ← Previous
              </Link>
            )}
          </div>
          <span className="text-foreground/55">
            Page {content.page} of {content.totalPages}
          </span>
          <div>
            {content.hasNext && (
              <Link href={pageHref(content.page + 1)} className="text-foreground/70 hover:text-foreground">
                Next →
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  )
}
