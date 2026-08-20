import Link from 'next/link'
import { PublicImage } from '@/components/media/PublicImage'
import type { ArticleIndexItem } from '@/features/articles/lib/fetchArticleIndex'

type ArticleSidebarProps = {
  trending: ArticleIndexItem[]
  partners: ArticleIndexItem[]
}

function AdSlot({ size }: { size: 'half-page' | 'rectangle' }) {
  const height = size === 'half-page' ? 'h-[250px] 1024:h-[600px]' : 'h-[250px]'

  return (
    <div className="w-full">
      <p className="mb-1.5 text-center font-[family-name:var(--font-dm-sans)] text-[9px] uppercase tracking-[0.2em] text-foreground/40">
        Advertisement
      </p>
      <div
        className={`flex ${height} w-full items-center justify-center border border-foreground/12 bg-foreground/[0.04]`}
        aria-hidden
      >
        <span className="font-[family-name:var(--font-dm-sans)] text-[10px] uppercase tracking-[0.16em] text-foreground/25">
          Ad space
        </span>
      </div>
    </div>
  )
}

function SidebarHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2
      id={id}
      className="border-b border-foreground/20 pb-2 font-[family-name:var(--font-dm-sans)] text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground"
    >
      {children}
    </h2>
  )
}

function SidebarArticleRow({ item, size }: { item: ArticleIndexItem; size: 'trending' | 'partner' }) {
  const thumb = size === 'trending' ? 'size-[72px]' : 'size-[56px]'

  return (
    <li>
      <Link href={item.href} className="group flex gap-3 py-3">
        <div className={`relative ${thumb} shrink-0 overflow-hidden bg-foreground/8`}>
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
        <p
          className={`min-w-0 font-display leading-snug text-foreground group-hover:underline ${
            size === 'trending' ? 'text-[15px]' : 'text-[14px]'
          }`}
        >
          {item.title}
        </p>
      </Link>
    </li>
  )
}

export function ArticleSidebar({ trending, partners }: ArticleSidebarProps) {
  return (
    <aside
      data-article-sidebar
      className="flex flex-col gap-8 pt-10 1024:pt-0"
      aria-label="Article sidebar"
    >
      <AdSlot size="half-page" />

      {trending.length > 0 ? (
        <section aria-labelledby="article-trending-heading">
          <SidebarHeading id="article-trending-heading">Trending News</SidebarHeading>
          <ul className="divide-y divide-foreground/12">
            {trending.map((item) => (
              <SidebarArticleRow key={item.id} item={item} size="trending" />
            ))}
          </ul>
        </section>
      ) : null}

      <AdSlot size="rectangle" />

      {partners.length > 0 ? (
        <section aria-labelledby="article-partners-heading">
          <SidebarHeading id="article-partners-heading">From Our Partners</SidebarHeading>
          <ul className="divide-y divide-foreground/12">
            {partners.map((item) => (
              <SidebarArticleRow key={item.id} item={item} size="partner" />
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  )
}
