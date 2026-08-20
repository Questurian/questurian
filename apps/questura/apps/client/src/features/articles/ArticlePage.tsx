import Link from 'next/link'
import { PublicImage } from '@/components/media/PublicImage'
import { GatedArticleBody } from '@/features/articles/components/GatedArticleBody'
import { ArticleShareBar } from '@/features/articles/components/ArticleShareBar'
import { AddOnGoogleButton } from '@/features/articles/components/AddOnGoogleButton'
import {
  ArticleRail,
  ArticlePartners,
} from '@/features/articles/components/ArticleSidebar'
import { readGate } from '@/features/articles/lib/gate'
import { articleCrumbsFromPath } from '@/features/articles/lib/articleCrumbs'
import { fetchStandardArticleSidebar } from '@/features/articles/lib/fetchArticleSidebar'
import { BlockRenderer } from '@/features/articles/components/BlockRenderer'
import { AuthorLink } from '@/features/authors/components/AuthorLink'
import { getPublicBaseUrl } from '@/lib/seo/publicBaseUrl'
import { Article } from './types'

function formatMagazineDate(iso: string | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  }).format(date)
}

function StandardArticleHeader({
  article,
  path,
  shareUrl,
}: {
  article: Article
  path?: string
  shareUrl: string
}) {
  const { title, author, publishedAt, updatedAt, seoSection, headerSection } = article
  const description = seoSection?.metaDescription
  const displayName = author?.displayName
  const dateLine = formatMagazineDate(publishedAt ?? updatedAt)
  const crumbs = articleCrumbsFromPath(path)

  return (
    <header className="px-4 pt-8 pb-6 1024:px-0 1024:pt-10 1024:pb-8">
      <div className="mb-5 flex flex-col gap-2 1024:mb-6 1024:flex-row 1024:items-baseline 1024:justify-between 1024:gap-6">
        {crumbs.length > 0 ? (
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-x-1.5 font-[family-name:var(--font-dm-sans)] text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
              {crumbs.map((crumb, index) => (
                <li key={`${crumb.label}-${index}`} className="flex items-center gap-x-1.5">
                  {index > 0 ? <span aria-hidden className="text-accent/60">›</span> : null}
                  {crumb.href ? (
                    <Link href={crumb.href} className="hover:underline">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span>{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : (
          <span />
        )}
        {displayName || dateLine ? (
          <p className="font-display text-[15px] italic leading-snug text-foreground 1024:text-right">
            {displayName ? (
              <>
                By{' '}
                <AuthorLink
                  authorSlug={author?.slug}
                  authorId={author?.id}
                  className="hover:underline"
                >
                  {displayName}
                </AuthorLink>
              </>
            ) : null}
            {displayName && dateLine ? ' • ' : null}
            {dateLine}
          </p>
        ) : null}
      </div>

      <h1 className="font-display text-[32px] font-normal leading-[1.08] text-foreground sm:text-[40px] 1024:text-[44px]">
        {title}
      </h1>

      {description ? (
        <>
          <div className="mt-5 h-px w-full bg-foreground/18" aria-hidden />
          <p className="mt-5 max-w-[40rem] font-display text-[18px] italic leading-[1.4] text-foreground/80 sm:text-[20px]">
            {description}
          </p>
        </>
      ) : (
        <div className="mt-5 h-px w-full bg-foreground/18" aria-hidden />
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <ArticleShareBar
          url={shareUrl}
          title={title}
          imageUrl={headerSection?.featuredImage?.url}
        />
        {/* Same CTA the listicle/itinerary headers render (see ArticlePageHeader). */}
        <AddOnGoogleButton variant="google" />
      </div>
    </header>
  )
}

export async function ArticlePage({ article, path }: { article: Article; path?: string }) {
  const { headerSection, contentBlocks } = article
  const featuredImage = headerSection?.featuredImage
  const gate = readGate(article)
  const sidebar = await fetchStandardArticleSidebar(article, path)
  const sharePath = path && path.startsWith('/') ? path : `/${article.slug}`
  const shareUrl = `${getPublicBaseUrl()}${sharePath}`

  return (
    <article data-article-layout="standard" className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-6xl px-0 1024:px-8">
        <div className="1024:grid 1024:grid-cols-[1fr_300px] 1024:gap-x-12">
          <div className="1024:col-start-1 1024:row-start-1">
            <StandardArticleHeader article={article} path={path} shareUrl={shareUrl} />
          </div>

          <div className="min-w-0 1024:col-start-1 1024:row-start-2">
            {featuredImage?.url ? (
              <figure className="px-0">
                <div className="aspect-[16/10] w-full overflow-hidden">
                  <PublicImage
                    src={featuredImage.url}
                    alt={featuredImage.alt_text ?? ''}
                    width={1600}
                    height={1000}
                    sizes="(min-width: 1024px) 780px, 100vw"
                    className="h-full w-full object-cover"
                    priority
                  />
                </div>
                {featuredImage.alt_text ? (
                  <figcaption className="px-4 pt-2 font-mono text-[11px] text-foreground/45 1024:px-0">
                    {featuredImage.alt_text}
                  </figcaption>
                ) : null}
              </figure>
            ) : null}

            <div className="px-4 pt-8 pb-16 1024:px-0 1024:pt-10 1024:pb-20">
              <div className="space-y-8 sm:space-y-10">
                {contentBlocks?.map((block) => (
                  <BlockRenderer key={block.id} block={block} />
                ))}

                {gate?.locked ? (
                  <GatedArticleBody articleId={article.id} gate={gate} path={path ?? '/'} />
                ) : null}
              </div>
            </div>
          </div>

          <div className="px-4 pt-10 1024:col-start-2 1024:row-start-2 1024:px-0 1024:pt-0">
            <ArticleRail trending={sidebar.trending} />
          </div>
        </div>

        <div className="px-4 1024:px-0">
          <ArticlePartners partners={sidebar.partners} />
        </div>
      </div>
    </article>
  )
}
