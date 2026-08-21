import Link from 'next/link'
import { PublicImage } from '@/components/media/PublicImage'
import { AdLabel, AdMockSurface } from '@/features/articles/components/AdMock'
import type { ArticleIndexItem } from '@/features/articles/lib/fetchArticleIndex'

function AdSlot({ size }: { size: 'half-page' | 'square' }) {
  const height = size === 'half-page' ? 'h-[250px] 1024:h-[600px]' : 'h-[300px]'

  return (
    <div className="w-full">
      <AdLabel className="mb-1.5" />
      <AdMockSurface className={height} />
    </div>
  )
}

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2
      id={id}
      className="border-b border-foreground/20 pb-2 font-[family-name:var(--font-dm-sans)] text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground"
    >
      {children}
    </h2>
  )
}

/**
 * Ad rail. The ads pin below the navbar and stay there for the whole read, so
 * the top ad is always in view. The trending list sits *outside* the sticky
 * box, in the column below it: that keeps it from pushing the ads off-screen
 * (a sticky box taller than the viewport can only ever show one of its ends)
 * and gives the ads a containing block that ends just above it, so they
 * release into the trending list at the bottom of the article instead of
 * overlapping it.
 */
export function ArticleRail({ trending }: { trending: ArticleIndexItem[] }) {
  return (
    <div data-article-sidebar className="1024:flex 1024:h-full 1024:flex-col">
      <div className="1024:flex-1">
        <div className="flex flex-col gap-8 1024:sticky 1024:top-24">
          <AdSlot size="half-page" />
          <AdSlot size="square" />
        </div>
      </div>

      <div className="mt-8 1024:mt-10">
        <ArticleTrending trending={trending} />
      </div>
    </div>
  )
}

function ArticleTrending({ trending }: { trending: ArticleIndexItem[] }) {
  if (trending.length === 0) return null

  return (
    <section aria-labelledby="article-trending-heading">
      <SectionHeading id="article-trending-heading">Trending News</SectionHeading>
      <ul className="divide-y divide-foreground/12">
        {trending.map((item) => (
          <li key={item.id}>
            <Link href={item.href} className="group flex gap-3 py-3">
              <div className="relative size-[72px] shrink-0 overflow-hidden bg-foreground/8">
                {item.thumbnail ? (
                  <PublicImage
                    src={item.thumbnail.url}
                    alt={item.thumbnail.alt ?? ''}
                    width={144}
                    height={144}
                    sizes="72px"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : null}
              </div>
              <p className="min-w-0 font-display text-[15px] leading-snug text-foreground group-hover:underline">
                {item.title}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Full-width card row that closes the page. */
export function ArticlePartners({ partners }: { partners: ArticleIndexItem[] }) {
  if (partners.length === 0) return null

  return (
    <section aria-labelledby="article-partners-heading" className="pt-12 pb-16 1024:pt-16 1024:pb-20">
      <SectionHeading id="article-partners-heading">From Our Partners</SectionHeading>
      <ul className="mt-6 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 1024:grid-cols-5">
        {partners.map((item) => (
          <li key={item.id}>
            <Link href={item.href} className="group block">
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-foreground/8">
                {item.thumbnail ? (
                  <PublicImage
                    src={item.thumbnail.url}
                    alt={item.thumbnail.alt ?? ''}
                    width={480}
                    height={360}
                    sizes="(min-width: 1024px) 210px, (min-width: 640px) 30vw, 45vw"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : null}
              </div>
              <p className="mt-2.5 font-display text-[15px] leading-snug text-foreground group-hover:underline">
                {item.title}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
