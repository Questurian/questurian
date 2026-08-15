import { Bookmark, Share2 } from 'lucide-react'
import { PublicImage } from '@/components/media/PublicImage'
import { GatedArticleBody } from '@/features/articles/components/GatedArticleBody'
import { readGate } from '@/features/articles/lib/gate'
import { BlockRenderer } from '@/features/articles/components/BlockRenderer'
import { AuthorLink } from '@/features/authors/components/AuthorLink'
import { Article } from './types'

function formatArticleDate(iso: string | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: 'America/New_York',
  })
    .format(date)
    .replace(' at ', ', ')
}

function formatLocationLabel(location: string | undefined): string {
  const parts = (location ?? '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 0) return 'Questurian'

  return parts
    .map((part) =>
      part
        .split('-')
        .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : word))
        .join(' '),
    )
    .join(' / ')
}

function StandardArticleHeader({ article }: { article: Article }) {
  const { title, author, publishedAt, updatedAt, seoSection, location } = article
  const description = seoSection?.metaDescription
  const label = formatLocationLabel(location)
  const displayName = author?.displayName
  const dateLine = formatArticleDate(publishedAt ?? updatedAt)

  return (
    <header className="mx-auto w-full max-w-[840px] px-4 pt-8 pb-8 sm:px-0 sm:pt-12 sm:pb-10 lg:pt-16">
      <p className="mb-7 font-mono text-[12px] uppercase tracking-[0.18em] text-foreground">
        {label}
      </p>
      <h1 className="font-display text-[36px] font-normal leading-[1.05] text-foreground sm:text-[46px] lg:text-[52px]">
        {title}
      </h1>
      {description ? (
        <p className="mt-6 max-w-[680px] font-display text-[20px] leading-[1.32] text-foreground sm:text-[22px] lg:text-[23px]">
          {description}
        </p>
      ) : null}
      {displayName ? (
        <p className="mt-7 font-display text-[20px] leading-snug text-foreground sm:text-[22px]">
          By <AuthorLink authorSlug={author?.slug} authorId={author?.id} className="hover:underline">{displayName}</AuthorLink>
        </p>
      ) : null}
      {dateLine ? (
        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground/55 sm:hidden">
          {dateLine}
        </p>
      ) : null}
    </header>
  )
}

function ArticleMetaRow({
  publishedAt,
  updatedAt,
}: {
  publishedAt?: string
  updatedAt?: string
}) {
  const dateLine = formatArticleDate(publishedAt ?? updatedAt)

  return (
    <div className="mx-auto max-w-[700px] border-b border-t border-foreground/18 px-4 py-5 sm:px-0">
      <div className="flex items-center justify-between gap-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">
          {dateLine}
        </p>
        <div className="flex shrink-0 items-center gap-6 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">
          <button type="button" className="inline-flex items-center gap-1.5 hover:text-terracotta">
            Share <Share2 size={16} strokeWidth={1.6} aria-hidden />
          </button>
          <button type="button" className="inline-flex items-center gap-1.5 hover:text-terracotta">
            Save <Bookmark size={16} strokeWidth={1.6} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}


// ── Main component ───────────────────────────────────────────────────────────

export function ArticlePage({ article, path }: { article: Article; path?: string }) {
  const { publishedAt, updatedAt, headerSection, contentBlocks } = article
  const featuredImage = headerSection?.featuredImage
  const gate = readGate(article)

  return (
    <article
      data-article-layout="standard"
      className="min-h-screen bg-background"
    >
      <div className="mx-auto w-full max-w-[960px]">

        <StandardArticleHeader article={article} />

        {/* ── Featured image ───────────────────────────────────────── */}
        {featuredImage?.url && (
          <figure className="px-0">
            <div className="aspect-[16/10] w-full overflow-hidden">
              <PublicImage
                src={featuredImage.url}
                alt={featuredImage.alt_text ?? ''}
                width={1600}
                height={1000}
                sizes="(min-width: 1024px) 880px, (min-width: 768px) 760px, 100vw"
                className="w-full h-full object-cover"
                priority
              />
            </div>
            {featuredImage.alt_text ? (
              <figcaption className="pt-2 font-mono text-[11px] text-foreground/45">
                {featuredImage.alt_text}
              </figcaption>
            ) : null}
          </figure>
        )}

        <ArticleMetaRow publishedAt={publishedAt} updatedAt={updatedAt} />

        {/* ── Content blocks ───────────────────────────────────────── */}
        <div className="px-4 pt-10 pb-20 sm:px-0 sm:pt-12">
          <div className="mx-auto max-w-[700px] space-y-8 sm:space-y-10">
            {contentBlocks?.map((block) => (
              <BlockRenderer key={block.id} block={block} />
            ))}

            {gate?.locked ? (
              <GatedArticleBody articleId={article.id} gate={gate} path={path ?? '/'} />
            ) : null}
          </div>
        </div>

      </div>
    </article>
  )
}
