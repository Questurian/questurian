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
  return article.author?.name || 'Questurian'
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

function CreatorAvatar({
  article,
  authorLabel,
}: {
  article: FeaturedArticleTeaser
  authorLabel: string
}): JSX.Element {
  const avatarUrl = article.author?.avatar?.url ?? null
  const avatarAlt = article.author?.avatar?.alt ?? `${authorLabel} profile photo`

  const ring = (
    <span className="block size-16 overflow-hidden rounded-full bg-[#1a1a1a] ring-2 ring-white/20 768:size-[4.5rem] 1024:size-20">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={avatarAlt} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[#6a635c]" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor" className="size-[55%]">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
          </svg>
        </span>
      )}
    </span>
  )

  return (
    <div className="mb-5 flex justify-center">
      <AuthorLink
        authorSlug={article.author?.slug}
        authorId={article.author?.id}
        nested
        className="block"
      >
        {ring}
      </AuthorLink>
    </div>
  )
}

export function FeaturedArticleOneArticlePreview({
  block,
  showAuthorAvatar = false,
}: HomepageBlockLayoutProps<CityHomepageArticleBlock> & {
  showAuthorAvatar?: boolean
}): JSX.Element | null {
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
  const creatorKicker = showAuthorAvatar
    ? block.creatorKicker?.trim() || sectionHeading
    : null
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
        <div className={`city-article-content px-6 py-9 ${showAuthorAvatar ? 'text-center' : ''}`}>
          {creatorKicker ? (
            <p className="mb-6 text-center font-[family-name:var(--font-dm-sans)] text-[0.88rem] font-bold uppercase tracking-[0.16em] text-accent-soft">
              {creatorKicker}
            </p>
          ) : null}
          {showAuthorAvatar ? <CreatorAvatar article={article} authorLabel={authorLabel} /> : null}
          <h2 className="font-editorial font-semibold text-[2.1rem] leading-[1.0] text-white">
            {article.title}
          </h2>
          {excerpt ? (
            <p data-article-dek className="mt-4 font-editorial text-[0.95rem] leading-[1.55] text-[#b0a89e]">
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
      <div
        className={`relative flex flex-col px-6 768:w-1/2 1024:px-10 1280:px-12 ${
          showAuthorAvatar
            ? 'justify-start py-10 1024:py-14 1280:py-16'
            : 'justify-center py-8'
        }`}
      >
        <div className="city-article-content mx-auto w-full max-w-[460px] text-center">
          {creatorKicker ? (
            <p className="mb-6 text-center font-[family-name:var(--font-dm-sans)] text-[0.9rem] font-bold uppercase tracking-[0.16em] text-accent-soft 1024:text-[1rem]">
              {creatorKicker}
            </p>
          ) : null}
          {showAuthorAvatar ? <CreatorAvatar article={article} authorLabel={authorLabel} /> : null}
          <h2 className="font-editorial font-semibold leading-[1.15] text-white text-[1.35rem] 1024:text-[1.6rem] 1280:text-[1.85rem]">
            {article.title}
          </h2>
          {excerpt ? (
            <p data-article-dek className="mt-3 font-editorial text-[0.85rem] leading-[1.45] text-[#b0a89e] 1024:text-[0.9rem]">
              {excerpt}
            </p>
          ) : null}
          <p className="mt-4 font-[family-name:var(--font-dm-sans)] text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-[#6a635c]">
            BY <AuthorLink authorSlug={article.author?.slug} authorId={article.author?.id} nested className="hover:underline">{authorLabel}</AuthorLink>
          </p>
        </div>
        <TextSkeleton className="justify-center px-6 py-8 1024:px-10 1280:px-12" />
      </div>
      <div className="768:w-1/2 768:py-10 768:pr-8 1024:py-14 1024:pr-12 1280:py-16 1280:pr-16 flex items-center">
        <div className="city-article-image-shell relative ml-auto w-[96%] aspect-[3/2] overflow-hidden bg-[#1a1a1a]">
          {desktopImageUrl ? (
            <ArticleImage src={desktopImageUrl} priority className="h-full w-full object-cover" status={desktopImage} />
          ) : null}
        </div>
      </div>
    </>
  )

  return (
    <section className="bg-[#0a0a0a] text-white">
      {sectionHeading && !showAuthorAvatar ? (
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
          className={`city-article-card city-article-card--dark hidden 768:flex 768:items-center ${BLOCK_MAX_WIDTH_CLASS} ${BLOCK_GUTTER_CLASS}`}
          data-content-ready={desktopImage.isContentReady ? 'true' : 'false'}
          data-image-loaded={desktopImage.isImageLoaded ? 'true' : 'false'}
        >
          {desktopContent}
        </Link>
      ) : (
        <div
          className={`city-article-card city-article-card--dark hidden 768:flex 768:items-center ${BLOCK_MAX_WIDTH_CLASS} ${BLOCK_GUTTER_CLASS}`}
          data-content-ready={desktopImage.isContentReady ? 'true' : 'false'}
          data-image-loaded={desktopImage.isImageLoaded ? 'true' : 'false'}
        >
          {desktopContent}
        </div>
      )}
    </section>
  )
}
