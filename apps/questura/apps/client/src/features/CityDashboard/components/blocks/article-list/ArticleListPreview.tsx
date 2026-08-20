'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type JSX } from 'react'

import type {
  CityHomepageArticleBlock,
  FeaturedArticleTeaser,
  HomepageBlockLayoutProps,
} from '../../../types'
import { BlockSection } from '../BlockSection'
import { AuthorLink } from '@/features/authors/components/AuthorLink'

function joinClassNames(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

function getArticleTypeLabel(article: FeaturedArticleTeaser): string {
  return article.articleType ?? article.category?.name ?? 'Article'
}

function getAuthorLabel(article: FeaturedArticleTeaser): string {
  return article.author?.name || 'Questurian'
}

function getArticleKey(article: FeaturedArticleTeaser, index: number): string {
  return [article.title, article.imageUrlSquare ?? article.imageUrl ?? index].join(':')
}

type ArticleRowProps = {
  article: FeaturedArticleTeaser
  isPriority: boolean
}

function ArticleRow({ article, isPriority }: ArticleRowProps): JSX.Element {
  const imageUrl = article.imageUrlSquare ?? article.imageUrl ?? null
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [imageStatus, setImageStatus] = useState<'loading' | 'loaded' | 'failed'>(
    imageUrl ? 'loading' : 'failed',
  )

  useEffect(() => {
    setImageStatus(imageUrl ? 'loading' : 'failed')
    const image = imageRef.current
    if (!imageUrl || !image) return
    if (image.complete && image.naturalWidth > 0) {
      setImageStatus('loaded')
    }
  }, [imageUrl])

  const isImageLoaded = imageStatus === 'loaded'
  const articleTypeLabel = getArticleTypeLabel(article)
  const excerpt = article.excerpt ?? null
  const authorLabel = getAuthorLabel(article)
  const articlePath = article.articlePath ?? null

  const inner = (
    <>
      {/* ── Text ─────────────────────────────────────────── */}
      <div className="min-w-0 flex-1">
        <p className="font-[family-name:var(--font-dm-sans)] text-[0.62rem] font-semibold uppercase leading-none tracking-[0.12em] text-[#1a1a1a] 768:text-[0.67rem]">
          {articleTypeLabel}
        </p>

        <h3 className="mt-2 font-editorial text-[1.25rem] font-semibold leading-[1.15] text-[#1a1a1a] 768:text-[1.45rem] 1024:text-[1.65rem]">
          {article.title}
        </h3>

        {excerpt ? (
          <p data-article-dek className="mt-2 font-editorial text-[0.88rem] font-normal leading-[1.5] text-[#3f3a35] 768:text-[0.92rem] 1024:text-[0.95rem]">
            {excerpt}
          </p>
        ) : null}

        <p className="mt-3 font-[family-name:var(--font-dm-sans)] text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-[#5f5952] 768:text-[0.65rem]">
          By <AuthorLink authorSlug={article.author?.slug} authorId={article.author?.id} nested className="hover:underline">{authorLabel}</AuthorLink>
        </p>
      </div>

      {/* ── Image ────────────────────────────────────────── */}
      <div className="relative h-[120px] w-[120px] shrink-0 overflow-hidden bg-[#d7dcde] 768:h-[150px] 768:w-[150px] 1024:h-[180px] 1024:w-[180px]">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imageRef}
            src={imageUrl}
            alt=""
            className={joinClassNames(
              'h-full w-full object-cover transition-opacity duration-300',
              isImageLoaded ? 'opacity-100' : 'opacity-0',
            )}
            decoding="async"
            fetchPriority={isPriority ? 'high' : 'auto'}
            loading={isPriority ? 'eager' : 'lazy'}
            onError={() => setImageStatus('failed')}
            onLoad={() => setImageStatus('loaded')}
          />
        ) : null}
      </div>
    </>
  )

  const rowClass = 'flex items-start gap-4 py-6 768:gap-8 768:py-8 1024:py-10'

  return articlePath ? (
    <Link href={articlePath} className={rowClass}>
      {inner}
    </Link>
  ) : (
    <article className={rowClass}>{inner}</article>
  )
}

export function ArticleListPreview({
  block,
}: HomepageBlockLayoutProps<CityHomepageArticleBlock>): JSX.Element | null {
  if (block.items.length === 0) return null

  const sectionHeading = block.sectionHeading?.trim() || null
  const sectionSubheading = block.sectionSubheading?.trim() || null

  return (
    <BlockSection className="bg-[#f5f0e8]" contentClassName="pb-6 pt-8" aria-label="Article list">
        {sectionHeading ? (
          <div className="mb-4 pb-2">
            <h2 className="font-editorial text-[1.4rem] font-semibold leading-tight text-[#1a1a1a] 768:text-[1.7rem] 1024:text-[2rem] 1280:text-[2.3rem]">
              {sectionHeading}
            </h2>
            {sectionSubheading ? (
              <p className="mt-1 font-[family-name:var(--font-dm-sans)] text-[0.75rem] leading-relaxed text-[#3f3a35] 768:text-[0.85rem]">
                {sectionSubheading}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="divide-y divide-[#d9d3c9]">
          {block.items.map((article, index) => (
            <ArticleRow
              key={getArticleKey(article, index)}
              article={article}
              isPriority={index === 0}
            />
          ))}
        </div>
    </BlockSection>
  )
}
