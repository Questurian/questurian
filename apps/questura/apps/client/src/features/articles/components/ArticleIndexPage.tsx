import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PublicImage } from '@/components/media/PublicImage'
import { BookmarkButton } from '@/features/bookmarks/components/BookmarkButton'
import { fetchArticleIndex } from '@/features/articles/lib/fetchArticleIndex'
import {
  hubHrefForScope,
  indexHrefForScope,
  type ArticleScope,
  type ArticleTypeKey,
} from '@/features/articles/lib/articleScope'

type Props = {
  scope: ArticleScope
  type: ArticleTypeKey
  page: number
  lang?: string
}

const TYPE_LABEL: Record<ArticleTypeKey, string> = {
  articles: 'Articles',
  maps: 'Maps',
  itineraries: 'Itineraries',
}

function formatDate(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function scopeHeading(scope: ArticleScope, type: ArticleTypeKey): string {
  const typeLabel = TYPE_LABEL[type]
  if (scope.kind === 'global') return typeLabel
  if (scope.kind === 'country') return `${formatSegmentName(scope.country)} ${typeLabel}`
  return `${formatSegmentName(scope.city)} ${typeLabel}`
}

function formatSegmentName(segment: string): string {
  return segment
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export async function ArticleIndexPage({ scope, type, page, lang }: Props) {
  if (page < 1) notFound()

  const data = await fetchArticleIndex({ scope, type, page, lang })
  if (!data || data.items.length === 0) notFound()

  return (
    <section className="min-h-[70vh] bg-background px-5 py-16 text-foreground 768:px-10 1024:px-16">
      <div className="mx-auto max-w-6xl">
        <header className="mb-12 max-w-3xl">
          <p className="mb-5 text-[11px] font-semibold uppercase leading-none tracking-[0.28em] text-foreground/55">
            Questurian
          </p>
          <h1 className="font-display text-[48px] font-medium leading-[0.95] text-foreground 480:text-[64px] 768:text-[84px]">
            {scopeHeading(scope, type)}
          </h1>
        </header>

        <ul className="grid gap-10 768:grid-cols-2 1024:grid-cols-3">
          {data.items.map((item) => (
            <li key={item.id} className="group">
              <Link href={item.href} className="block">
                {item.thumbnail && (
                  <div className="relative mb-4 aspect-[4/3] w-full overflow-hidden rounded-lg bg-foreground/5">
                    <div className="absolute right-2 top-2 z-10">
                      <BookmarkButton
                        targetType={type}
                        targetId={Number(item.id)}
                        variant="card"
                      />
                    </div>
                    <PublicImage
                      src={item.thumbnail.url}
                      alt={item.thumbnail.alt ?? ''}
                      width={600}
                      height={450}
                      sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  </div>
                )}
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/55">
                  {formatDate(item.publishedAt)}
                </p>
                <h2 className="font-display text-[22px] leading-tight text-foreground 480:text-[26px]">
                  {item.title}
                </h2>
                {item.excerpt && (
                  <p className="mt-2 text-[14px] leading-6 text-foreground/68">{item.excerpt}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>

        <Pagination
          scope={scope}
          type={type}
          page={data.page}
          totalPages={data.totalPages}
        />

        <div className="mt-10 text-[13px] text-foreground/60">
          <Link href={hubHrefForScope(scope)} className="underline-offset-4 hover:underline">
            ← Back
          </Link>
        </div>
      </div>
    </section>
  )
}

type PaginationProps = {
  scope: ArticleScope
  type: ArticleTypeKey
  page: number
  totalPages: number
}

function Pagination({ scope, type, page, totalPages }: PaginationProps) {
  if (totalPages <= 1) return null

  const prevHref = page > 1 ? indexHrefForScope(scope, type, page - 1) : null
  const nextHref = page < totalPages ? indexHrefForScope(scope, type, page + 1) : null

  return (
    <nav
      aria-label="Pagination"
      className="mt-16 flex items-center justify-between border-t border-foreground/14 pt-8 text-[14px]"
    >
      <div>
        {prevHref && (
          <Link href={prevHref} className="text-foreground/70 hover:text-foreground">
            ← Previous
          </Link>
        )}
      </div>
      <span className="text-foreground/55">
        Page {page} of {totalPages}
      </span>
      <div>
        {nextHref && (
          <Link href={nextHref} className="text-foreground/70 hover:text-foreground">
            Next →
          </Link>
        )}
      </div>
    </nav>
  )
}
