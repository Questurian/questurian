import Link from 'next/link'

import type {
  EditorialFeatureBlock,
  FeaturedArticleTeaser,
  HomepageBlockLayoutProps,
} from '../../../types'
import { BlockSection } from '../BlockSection'

function Linked({ href, className, children }: {
  href: string | null
  className?: string
  children: React.ReactNode
}) {
  return href ? <Link href={href} className={className}>{children}</Link> : <>{children}</>
}

function ArticleImage({ article, square }: { article: FeaturedArticleTeaser; square: boolean }) {
  const src = square
    ? article.imageUrlSquare ?? article.imageUrl
    : article.imageWide?.url ?? article.imageUrl ?? article.imageUrlSquare
  if (!src) return null
  const alt = square
    ? article.imageSquare?.alt ?? article.image?.alt ?? ''
    : article.imageWide?.alt ?? article.image?.alt ?? article.imageSquare?.alt ?? ''

  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt ?? ''} loading="lazy" decoding="async"
      className="h-full w-full object-cover transition-opacity duration-200 group-hover/image:opacity-85" />
  )
  return article.articlePath ? (
    <Link href={article.articlePath}
      className="group/image block h-full w-full overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      {image}
    </Link>
  ) : image
}

function RelatedArticle({ article, count, index }: {
  article: FeaturedArticleTeaser
  count: EditorialFeatureBlock['totalSlots']
  index: number
}) {
  const showImage = count !== 6
  const square = count === 2 || count === 3
  const imageColumn = count === 2
    ? '1024:grid-cols-[minmax(120px,48%)_1fr]'
    : '1024:grid-cols-[minmax(96px,38%)_1fr]'

  return (
    <article className={`grid min-w-0 gap-3 border-b border-foreground/25 pb-4 last:border-b-0 ${showImage ? imageColumn : 'grid-cols-[2rem_1fr]'}`}>
      {showImage ? (
        <div className={square ? 'aspect-square overflow-hidden bg-paper' : 'aspect-[16/10] overflow-hidden bg-paper'}>
          <ArticleImage article={article} square={square} />
        </div>
      ) : (
        <span aria-hidden="true" className="pt-0.5 font-sans text-xs font-semibold tabular-nums text-accent">
          {String(index + 1).padStart(2, '0')}
        </span>
      )}
      <div className="min-w-0 self-start">
        <p className="mb-1 font-sans text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-accent">
          <Linked
            href={article.articlePath}
            className="outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {article.category?.name ?? article.articleType ?? 'Article'}
          </Linked>
        </p>
        <h3 className="font-editorial text-[1.08rem] font-semibold leading-[1.08] text-foreground 1280:text-[1.24rem]">
          <Linked href={article.articlePath} className="outline-none focus-visible:ring-2 focus-visible:ring-accent">
            {article.title}
          </Linked>
        </h3>
      </div>
    </article>
  )
}

export function EditorialFeaturePreview({ block }: HomepageBlockLayoutProps<EditorialFeatureBlock>) {
  const featureHref = block.linkedLocation?.href ?? null
  const portrait = block.featureImagePortrait ?? block.featureImageWide
  const wide = block.featureImageWide ?? block.featureImagePortrait

  return (
    <BlockSection
      aria-label={block.featureTitle ?? 'Featured destination'}
      className="bg-background py-12 768:py-16 1280:py-20"
    >
      <div className="grid gap-8 768:grid-cols-[minmax(230px,0.82fr)_1.18fr] 768:items-stretch 1024:grid-cols-[minmax(260px,0.9fr)_minmax(280px,0.9fr)_minmax(330px,1.1fr)] 1024:gap-10">
        <div className="aspect-[16/10] overflow-hidden bg-paper 768:aspect-[4/5]">
          {wide?.url || portrait?.url ? (
            <Linked href={featureHref}
              className="group/image block h-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent">
              <picture className="block h-full w-full">
                {portrait?.url ? <source media="(min-width: 768px)" srcSet={portrait.url} /> : null}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={(wide ?? portrait)?.url} alt={(wide ?? portrait)?.alt ?? ''}
                  className="h-full w-full object-cover transition-opacity duration-200 group-hover/image:opacity-85" />
              </picture>
            </Linked>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col justify-center border-y border-foreground/30 py-8 text-center 768:px-5 1024:border-y-0 1024:px-0">
          {block.featureKicker ? (
            <p className="mb-4 font-sans text-xs font-semibold uppercase tracking-[0.14em] text-accent">
              <Linked href={featureHref} className="outline-none focus-visible:ring-2 focus-visible:ring-accent">
                {block.featureKicker}
              </Linked>
            </p>
          ) : null}
          {block.featureTitle ? (
            <h2 className="font-display text-[2.65rem] font-medium leading-[0.95] text-foreground 768:text-[3.35rem]">
              <Linked href={featureHref} className="outline-none focus-visible:ring-2 focus-visible:ring-accent">
                {block.featureTitle}
              </Linked>
            </h2>
          ) : null}
          {block.featureDescription ? (
            <p className="mx-auto mt-7 max-w-[38rem] font-editorial text-[1.05rem] leading-[1.55] text-foreground/80">
              <Linked href={featureHref} className="outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent">
                {block.featureDescription}
              </Linked>
            </p>
          ) : null}
        </div>

        <div className={`grid content-start gap-4 border-t border-foreground/70 pt-6 768:col-span-2 768:grid-cols-2 1024:col-span-1 1024:grid-cols-1 1024:border-l 1024:border-t-0 1024:pl-6 1024:pt-0 ${block.totalSlots === 6 ? '1280:grid-cols-1' : ''}`}>
          {block.items.map((article, index) => (
            <RelatedArticle key={`${article.articlePath ?? article.title}:${index}`}
              article={article} count={block.totalSlots} index={index} />
          ))}
        </div>
      </div>
    </BlockSection>
  )
}
