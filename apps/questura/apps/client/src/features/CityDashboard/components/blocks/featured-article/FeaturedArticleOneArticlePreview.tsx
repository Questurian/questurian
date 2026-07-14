'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type JSX } from 'react'

import type {
  CityHomepageArticleBlock,
  FeaturedArticleTeaser,
  HomepageBlockLayoutProps,
} from '../../../types'
import { BLOCK_GUTTER_CLASS, BLOCK_MAX_WIDTH_CLASS } from '../BlockSection'
import { AuthorLink } from '@/features/authors/components/AuthorLink'

function getAuthorLabel(article: FeaturedArticleTeaser): string {
  const name = article.author?.name
  const fullName = [article.author?.firstName, article.author?.lastName].filter(Boolean).join(' ')
  return name || fullName || 'Questurian'
}

function useArticleImageStatus(imageUrl: string | null) {
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [imageStatus, setImageStatus] = useState<'loading' | 'loaded' | 'failed'>(
    imageUrl ? 'loading' : 'failed',
  )
  const isImageLoaded = !imageUrl || imageStatus === 'loaded'
  const isContentReady = !imageUrl || imageStatus !== 'loading'

  // Reconcile images that finished loading before hydration attached onLoad,
  // otherwise the image can stay stuck at opacity-0 after an SSR render.
  useEffect(() => {
    setImageStatus(imageUrl ? 'loading' : 'failed')
    const image = imageRef.current
    if (!imageUrl || !image) return
    if (image.complete && image.naturalWidth > 0) {
      setImageStatus('loaded')
    }
  }, [imageUrl])

  return { imageRef, isContentReady, isImageLoaded, setImageStatus }
}

type ArticleImageStatus = ReturnType<typeof useArticleImageStatus>

function ArticleImage({
  src,
  priority,
  className,
  status,
}: {
  src: string
  priority: boolean
  className: string
  status: ArticleImageStatus
}): JSX.Element {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={status.imageRef}
      src={src}
      alt=""
      className={`${className} relative z-10 transition-opacity duration-500 ${status.isImageLoaded ? 'opacity-100' : 'opacity-0'}`}
      fetchPriority={priority ? 'high' : 'auto'}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => status.setImageStatus('failed')}
      onLoad={() => status.setImageStatus('loaded')}
    />
  )
}

function TextSkeleton({ className }: { className: string }): JSX.Element {
  return (
    <div aria-hidden="true" className={`city-article-text-skeleton absolute inset-0 flex flex-col ${className}`}>
      <span className="city-skeleton-line h-4 w-full" />
      <span className="city-skeleton-line mt-2.5 h-4 w-full" />
      <span className="city-skeleton-line mt-2.5 h-4 w-2/3" />
    </div>
  )
}

export function FeaturedArticleOneArticlePreview({
  block,
}: HomepageBlockLayoutProps<CityHomepageArticleBlock>): JSX.Element | null {
  const article = block.items[0] ?? null

  const desktopImageUrl = article ? (article.imageUrl ?? article.imageUrlSquare ?? null) : null
  const mobileImageUrl = article ? (article.imageUrlSquare ?? article.imageUrl ?? null) : null
  const mobileImage = useArticleImageStatus(mobileImageUrl)
  const desktopImage = useArticleImageStatus(desktopImageUrl)

  if (!article) return null

  const authorLabel = getAuthorLabel(article)
  const excerpt = article.excerpt ?? null
  const sectionHeading = block.sectionHeading?.trim() || null
  const sectionSubheading = block.sectionSubheading?.trim() || null
  const articlePath = article.articlePath ?? null

  const mobileContent = (
    <>
      {mobileImageUrl ? (
        <div className="city-article-image-shell relative w-full aspect-[3/2] overflow-hidden bg-[#1a1a1a]">
          <ArticleImage src={mobileImageUrl} priority className="h-full w-full object-cover" status={mobileImage} />
        </div>
      ) : (
        <div className="w-full aspect-[3/2] bg-[#1a1a1a]" />
      )}
      <div className="relative">
        <div className="city-article-content px-6 py-9">
          <h2 className="font-editorial font-semibold text-[2.1rem] leading-[1.0] text-white">
            {article.title}
          </h2>
          {excerpt ? (
            <p className="mt-4 font-editorial text-[0.95rem] leading-[1.55] text-[#b0a89e]">
              {excerpt}
            </p>
          ) : null}
          <p className="mt-7 text-center font-[family-name:var(--font-dm-sans)] text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[#6a635c]">
            BY <AuthorLink authorSlug={article.author?.slug} authorId={article.author?.id} nested className="hover:underline">{authorLabel}</AuthorLink>
          </p>
        </div>
        <TextSkeleton className="justify-start px-6 py-9" />
      </div>
    </>
  )

  const desktopContent = (
    <>
      <div className="relative flex flex-col justify-center py-14 pl-6 pr-10 768:w-1/2 1024:pl-10 1024:pr-14 1280:pl-12 1280:pr-16">
        <div className="city-article-content">
          <h2 className="font-editorial font-semibold leading-[1.0] text-white text-[2.4rem] 1024:text-[3rem] 1280:text-[3.6rem]">
            {article.title}
          </h2>
          {excerpt ? (
            <p className="mt-5 font-editorial text-[0.95rem] leading-[1.55] text-[#b0a89e] max-w-[480px] 1024:text-[1rem]">
              {excerpt}
            </p>
          ) : null}
          <p className="mt-8 font-[family-name:var(--font-dm-sans)] text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[#6a635c]">
            BY <AuthorLink authorSlug={article.author?.slug} authorId={article.author?.id} nested className="hover:underline">{authorLabel}</AuthorLink>
          </p>
        </div>
        <TextSkeleton className="justify-center py-14 pl-6 pr-10 1024:pl-10 1024:pr-14 1280:pl-12 1280:pr-16" />
      </div>
      <div className="768:w-1/2 768:py-8 768:pr-6 1024:py-10 1024:pr-10 1280:pr-12 flex items-stretch">
        <div className="city-article-image-shell relative w-full overflow-hidden bg-[#1a1a1a] 768:min-h-[360px] 1024:min-h-[420px]">
          {desktopImageUrl ? (
            <ArticleImage src={desktopImageUrl} priority className="h-full w-full object-cover" status={desktopImage} />
          ) : null}
        </div>
      </div>
    </>
  )

  return (
    <section className="bg-[#0a0a0a] text-white">
      {sectionHeading ? (
        <div className={`${BLOCK_MAX_WIDTH_CLASS} ${BLOCK_GUTTER_CLASS} pt-8 pb-2`}>
          <h2 className="font-editorial font-semibold leading-tight text-white text-[1.4rem] 768:text-[1.7rem] 1024:text-[2rem] 1280:text-[2.3rem]">
            {sectionHeading}
          </h2>
          {sectionSubheading ? (
            <p className="mt-1 font-[family-name:var(--font-dm-sans)] text-[0.75rem] 768:text-[0.85rem] 1024:text-[0.9rem] text-[#b0a89e] leading-relaxed">
              {sectionSubheading}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ── Mobile ─────────────────────────────────────────────── */}
      {articlePath ? (
        <Link
          href={articlePath}
          className="city-article-card city-article-card--dark block 768:hidden"
          data-content-ready={mobileImage.isContentReady ? 'true' : 'false'}
          data-image-loaded={mobileImage.isImageLoaded ? 'true' : 'false'}
        >
          {mobileContent}
        </Link>
      ) : (
        <div
          className="city-article-card city-article-card--dark 768:hidden"
          data-content-ready={mobileImage.isContentReady ? 'true' : 'false'}
          data-image-loaded={mobileImage.isImageLoaded ? 'true' : 'false'}
        >
          {mobileContent}
        </div>
      )}

      {/* ── Desktop ────────────────────────────────────────────── */}
      {articlePath ? (
        <Link
          href={articlePath}
          className={`city-article-card city-article-card--dark hidden 768:flex 768:items-stretch ${BLOCK_MAX_WIDTH_CLASS} ${BLOCK_GUTTER_CLASS}`}
          data-content-ready={desktopImage.isContentReady ? 'true' : 'false'}
          data-image-loaded={desktopImage.isImageLoaded ? 'true' : 'false'}
        >
          {desktopContent}
        </Link>
      ) : (
        <div
          className={`city-article-card city-article-card--dark hidden 768:flex 768:items-stretch ${BLOCK_MAX_WIDTH_CLASS} ${BLOCK_GUTTER_CLASS}`}
          data-content-ready={desktopImage.isContentReady ? 'true' : 'false'}
          data-image-loaded={desktopImage.isImageLoaded ? 'true' : 'false'}
        >
          {desktopContent}
        </div>
      )}
    </section>
  )
}
