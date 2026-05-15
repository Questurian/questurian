'use client'

import Link from 'next/link'
import { useRef, useState, type JSX } from 'react'

import type {
  CityHomepageArticleBlock,
  FeaturedArticleTeaser,
  HomepageBlockLayoutProps,
} from '../../../types'

function getAuthorLabel(article: FeaturedArticleTeaser): string {
  const name = article.author?.name
  const fullName = [article.author?.firstName, article.author?.lastName].filter(Boolean).join(' ')
  return name || fullName || 'Questurian'
}

function ArticleImage({
  src,
  priority,
  className,
}: {
  src: string
  priority: boolean
  className: string
}): JSX.Element {
  const [loaded, setLoaded] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={src}
      alt=""
      className={`${className} transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      fetchPriority={priority ? 'high' : 'auto'}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      onLoad={() => setLoaded(true)}
    />
  )
}

export function FeaturedArticleOneArticlePreview({
  block,
}: HomepageBlockLayoutProps<CityHomepageArticleBlock>): JSX.Element | null {
  const article = block.items[0]
  if (!article) return null

  const desktopImageUrl = article.imageUrl ?? article.imageUrlSquare ?? null
  const mobileImageUrl = article.imageUrlSquare ?? article.imageUrl ?? null
  const authorLabel = getAuthorLabel(article)
  const excerpt = article.excerpt ?? null
  const sectionHeading = block.sectionHeading?.trim() || null
  const sectionSubheading = block.sectionSubheading?.trim() || null
  const articlePath = article.articlePath ?? null

  const mobileContent = (
    <>
      {mobileImageUrl ? (
        <div className="w-full aspect-[3/2] overflow-hidden bg-[#1a1a1a]">
          <ArticleImage src={mobileImageUrl} priority className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="w-full aspect-[3/2] bg-[#1a1a1a]" />
      )}
      <div className="px-6 py-9">
        <h2 className="font-editorial font-semibold text-[2.1rem] leading-[1.0] text-white">
          {article.title}
        </h2>
        {excerpt ? (
          <p className="mt-4 font-editorial text-[0.95rem] leading-[1.55] text-[#b0a89e]">
            {excerpt}
          </p>
        ) : null}
        <p className="mt-7 text-center font-[family-name:var(--font-dm-sans)] text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[#6a635c]">
          BY {authorLabel}
        </p>
      </div>
    </>
  )

  const desktopContent = (
    <>
      <div className="flex flex-col justify-center px-12 py-14 768:w-1/2 1024:px-20 1280:px-28">
        <h2 className="font-editorial font-semibold leading-[1.0] text-white text-[2.4rem] 1024:text-[3rem] 1280:text-[3.6rem]">
          {article.title}
        </h2>
        {excerpt ? (
          <p className="mt-5 font-editorial text-[0.95rem] leading-[1.55] text-[#b0a89e] max-w-[480px] 1024:text-[1rem]">
            {excerpt}
          </p>
        ) : null}
        <p className="mt-8 font-[family-name:var(--font-dm-sans)] text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[#6a635c]">
          BY {authorLabel}
        </p>
      </div>
      <div className="768:w-1/2 768:py-8 768:pr-8 1024:py-10 1024:pr-12 flex items-stretch">
        <div className="w-full overflow-hidden bg-[#1a1a1a] 768:min-h-[360px] 1024:min-h-[420px]">
          {desktopImageUrl ? (
            <ArticleImage src={desktopImageUrl} priority className="h-full w-full object-cover" />
          ) : null}
        </div>
      </div>
    </>
  )

  return (
    <section className="bg-[#0a0a0a] text-white">
      {sectionHeading ? (
        <div className="mx-auto w-full max-w-[1400px] px-6 pt-8 pb-2 768:px-12 1024:px-20 1280:px-28">
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
        <Link href={articlePath} className="block 768:hidden">{mobileContent}</Link>
      ) : (
        <div className="768:hidden">{mobileContent}</div>
      )}

      {/* ── Desktop ────────────────────────────────────────────── */}
      {articlePath ? (
        <Link href={articlePath} className="hidden 768:flex 768:items-stretch mx-auto w-full max-w-[1400px]">
          {desktopContent}
        </Link>
      ) : (
        <div className="hidden 768:flex 768:items-stretch mx-auto w-full max-w-[1400px]">
          {desktopContent}
        </div>
      )}
    </section>
  )
}
