'use client'

import { useEffect, useRef, useState, type JSX } from 'react'

import type {
  CityHomepageArticleBlock,
  FeaturedArticleTeaser,
  HomepageBlockLayoutProps,
} from '../../../types'

function joinClassNames(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

function getArticleTypeLabel(article: FeaturedArticleTeaser): string {
  return article.articleType ?? article.category?.name ?? 'Article'
}

function getAuthorLabel(article: FeaturedArticleTeaser): string {
  const authorName = article.author?.name
  const fullName = [article.author?.firstName, article.author?.lastName].filter(Boolean).join(' ')
  return authorName || fullName || 'Questurian'
}

function getArticleKey(article: FeaturedArticleTeaser, index: number): string {
  return [article.title, article.imageUrlSquare ?? article.imageUrl ?? index].join(':')
}

function useArticleImageStatus(imageUrl: string | null) {
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [imageStatus, setImageStatus] = useState<'loading' | 'loaded' | 'failed'>(
    imageUrl ? 'loading' : 'failed',
  )
  const isImageLoaded = !imageUrl || imageStatus === 'loaded'
  const isContentReady = !imageUrl || imageStatus !== 'loading'

  useEffect(() => {
    const image = imageRef.current
    setImageStatus(imageUrl ? 'loading' : 'failed')
    if (!imageUrl || !image) return
    if (image.complete && image.naturalWidth > 0) {
      setImageStatus('loaded')
    }
  }, [imageUrl])

  return { imageRef, isContentReady, isImageLoaded, setImageStatus }
}

type ArticleListRowProps = {
  article: FeaturedArticleTeaser
  isPriority: boolean
}

function ArticleListRow({ article, isPriority }: ArticleListRowProps): JSX.Element {
  const imageUrl = article.imageUrlSquare ?? article.imageUrl ?? null
  const { imageRef, isContentReady, isImageLoaded, setImageStatus } =
    useArticleImageStatus(imageUrl)

  const articleTypeLabel = getArticleTypeLabel(article)
  const excerpt = article.excerpt ?? null
  const authorLabel = getAuthorLabel(article)

  return (
    <article
      className="flex gap-4 py-5 768:gap-6"
      data-content-ready={isContentReady ? 'true' : 'false'}
      data-image-loaded={isImageLoaded ? 'true' : 'false'}
    >
      <div className="relative h-[80px] w-[80px] shrink-0 overflow-hidden rounded-sm bg-[#d7dcde] 768:h-[96px] 768:w-[96px] 1024:h-[108px] 1024:w-[108px]">
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

      <div className="relative flex min-w-0 flex-1 flex-col justify-center">
        <p className="font-[family-name:var(--font-dm-sans)] text-[0.65rem] font-semibold uppercase leading-3 tracking-[0.08em] text-[#1e3599] 768:text-[0.72rem] 768:tracking-[0.1em]">
          {articleTypeLabel}
        </p>

        <h3 className="mt-1.5 font-editorial text-[1rem] font-semibold leading-[1.1] text-[#1a1a1a] 768:text-[1.1rem] 1024:text-[1.2rem]">
          {article.title}
        </h3>

        {excerpt ? (
          <p className="mt-1.5 overflow-hidden font-editorial text-[0.82rem] font-normal leading-[1.4] text-[#3f3a35] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] 768:text-[0.88rem]">
            {excerpt}
          </p>
        ) : null}

        <p className="mt-2 font-[family-name:var(--font-dm-sans)] text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-[#5f5952]">
          {authorLabel}
        </p>

        <div
          aria-hidden="true"
          className={joinClassNames(
            'absolute inset-0 flex flex-col justify-center transition-opacity duration-300',
            isContentReady ? 'opacity-0 pointer-events-none' : 'opacity-100',
          )}
        >
          <span className="city-skeleton-line h-2.5 w-20" />
          <span className="city-skeleton-line mt-2 h-4 w-11/12" />
          <span className="city-skeleton-line mt-1 h-4 w-4/5" />
          <span className="city-skeleton-line mt-2 h-2.5 w-16" />
        </div>
      </div>
    </article>
  )
}

export function ArticleListPreview({
  block,
}: HomepageBlockLayoutProps<CityHomepageArticleBlock>): JSX.Element | null {
  if (block.items.length === 0) return null

  const sectionHeading = block.sectionHeading?.trim() || null
  const sectionSubheading = block.sectionSubheading?.trim() || null

  return (
    <section className="bg-[#f5f0e8]" aria-label="Article list">
      <div className="mx-auto w-full max-w-[1400px] px-6 pt-8 pb-6 768:px-[30px]">
        {sectionHeading ? (
          <div className="mb-2 pb-4">
            <h2 className="font-editorial font-semibold leading-tight text-[#1a1a1a] text-[1.4rem] 768:text-[1.7rem] 1024:text-[2rem] 1280:text-[2.3rem]">
              {sectionHeading}
            </h2>
            {sectionSubheading ? (
              <p className="mt-1 font-[family-name:var(--font-dm-sans)] text-[0.75rem] 768:text-[0.85rem] 1024:text-[0.9rem] text-[#3f3a35] leading-relaxed">
                {sectionSubheading}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="divide-y divide-[#d9d3c9]">
          {block.items.map((article, index) => (
            <ArticleListRow
              key={getArticleKey(article, index)}
              article={article}
              isPriority={index === 0}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
