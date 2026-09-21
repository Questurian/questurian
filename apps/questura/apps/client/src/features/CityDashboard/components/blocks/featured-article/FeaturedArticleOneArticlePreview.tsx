import Link from '@/components/navigation/PublicLink'
import type { JSX } from 'react'

import type {
  CityHomepageArticleBlock,
  FeaturedArticleTeaser,
  HomepageBlockLayoutProps,
} from '../../../types'
import { BLOCK_GUTTER_CLASS, BLOCK_MAX_WIDTH_CLASS } from '../BlockSection'
import { AuthorLink } from '@/features/authors/components/AuthorLink'
import { NavigableImageTarget } from '../NavigableImageTarget'
import { PublicImage } from '@/components/media/PublicImage'
import { BLOCK_IMAGE_SIZES } from '../blockImageSizes'
import { heroImagePriority, type ImagePriority } from '../heroImagePriority'

function getAuthorLabel(article: FeaturedArticleTeaser): string {
  return article.author?.name || 'Questurian'
}

function ArticleImage({
  src,
  priority,
  className,
}: {
  src: string
  priority: ImagePriority
  className: string
}): JSX.Element {
  return (
    <PublicImage
      src={src}
      alt=""
      className={`${className} relative z-10`}
      fetchPriority={priority.fetchPriority}
      loading={priority.loading}
      decoding="async"
      sizes={BLOCK_IMAGE_SIZES.hero}
    />
  )
}

function CreatorAvatar({
  article,
  authorLabel,
  imagePriority,
}: {
  article: FeaturedArticleTeaser
  authorLabel: string
  imagePriority: ImagePriority
}): JSX.Element {
  const avatarUrl = article.author?.avatar?.url ?? null
  const avatarAlt = article.author?.avatar?.alt ?? `${authorLabel} profile photo`

  const ring = (
    <span className="block size-16 overflow-hidden rounded-full bg-[#1a1a1a] ring-2 ring-white/20 768:size-[4.5rem] 1024:size-20">
      {avatarUrl ? (
        <PublicImage
          src={avatarUrl}
          alt={avatarAlt}
          className="h-full w-full object-cover"
          {...imagePriority}
          sizes={BLOCK_IMAGE_SIZES.avatar}
        />
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
  blockIndex,
  showAuthorAvatar = false,
}: HomepageBlockLayoutProps<CityHomepageArticleBlock> & {
  showAuthorAvatar?: boolean
}): JSX.Element | null {
  const article = block.items[0] ?? null
  const imagePriority = heroImagePriority(blockIndex)

  const desktopImageUrl = article ? (article.imageUrl ?? article.imageUrlSquare ?? null) : null
  const mobileImageUrl = article ? (article.imageUrlSquare ?? article.imageUrl ?? null) : null
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
          <ArticleImage src={mobileImageUrl} priority={imagePriority} className="h-full w-full object-cover" />
          <NavigableImageTarget href={articlePath} label={`Read ${article.title}`} />
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
          {showAuthorAvatar ? <CreatorAvatar
              article={article}
              authorLabel={authorLabel}
              imagePriority={imagePriority}
            /> : null}
          <h2 className="font-editorial font-semibold text-[2.1rem] leading-[1.0] text-white">
            {articlePath ? <Link href={articlePath}>{article.title}</Link> : article.title}
          </h2>
          {excerpt ? (
            <p data-article-dek className="mt-4 font-editorial text-[0.95rem] leading-[1.55] text-[#b0a89e]">
              {articlePath ? <Link href={articlePath}>{excerpt}</Link> : excerpt}
            </p>
          ) : null}
          <p className="mt-7 text-center font-[family-name:var(--font-dm-sans)] text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[#6a635c]">
            BY <AuthorLink authorSlug={article.author?.slug} authorId={article.author?.id} className="hover:underline">{authorLabel}</AuthorLink>
          </p>
        </div>
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
          {showAuthorAvatar ? <CreatorAvatar
              article={article}
              authorLabel={authorLabel}
              imagePriority={imagePriority}
            /> : null}
          <h2 className="font-editorial font-semibold leading-[1.15] text-white text-[1.35rem] 1024:text-[1.6rem] 1280:text-[1.85rem]">
            {articlePath ? <Link href={articlePath}>{article.title}</Link> : article.title}
          </h2>
          {excerpt ? (
            <p data-article-dek className="mt-3 font-editorial text-[0.85rem] leading-[1.45] text-[#b0a89e] 1024:text-[0.9rem]">
              {articlePath ? <Link href={articlePath}>{excerpt}</Link> : excerpt}
            </p>
          ) : null}
          <p className="mt-4 font-[family-name:var(--font-dm-sans)] text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-[#6a635c]">
            BY <AuthorLink authorSlug={article.author?.slug} authorId={article.author?.id} className="hover:underline">{authorLabel}</AuthorLink>
          </p>
        </div>
      </div>
      <div className="768:w-1/2 768:py-10 768:pr-8 1024:py-14 1024:pr-12 1280:py-16 1280:pr-16 flex items-center">
        <div className="city-article-image-shell relative ml-auto w-[96%] aspect-[3/2] overflow-hidden bg-[#1a1a1a]">
          {desktopImageUrl ? (
            <ArticleImage src={desktopImageUrl} priority={imagePriority} className="h-full w-full object-cover" />
          ) : null}
          <NavigableImageTarget href={articlePath} label={`Read ${article.title}`} />
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
      <div className="city-article-card city-article-card--dark 768:hidden">{mobileContent}</div>

      {/* ── Desktop ────────────────────────────────────────────── */}
      <div
        className={`city-article-card city-article-card--dark hidden 768:flex 768:items-center ${BLOCK_MAX_WIDTH_CLASS} ${BLOCK_GUTTER_CLASS}`}
      >
        {desktopContent}
      </div>
    </section>
  )
}
