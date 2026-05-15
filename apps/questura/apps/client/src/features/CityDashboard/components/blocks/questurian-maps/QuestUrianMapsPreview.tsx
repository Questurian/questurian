'use client'

import { useRef, useState, type JSX } from 'react'

import type {
  CityHomepageArticleBlock,
  FeaturedArticleTeaser,
  HomepageBlockLayoutProps,
} from '../../../types'

function MapPinIcon(): JSX.Element {
  return (
    <svg
      width="20"
      height="26"
      viewBox="0 0 20 26"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M10 0C4.477 0 0 4.477 0 10c0 7.5 10 16 10 16s10-8.5 10-16C20 4.477 15.523 0 10 0zm0 13.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z"
        fill="#1e3599"
      />
    </svg>
  )
}

function MapCarouselCard({
  item,
  isPriority,
  isLast,
}: {
  item: FeaturedArticleTeaser
  isPriority: boolean
  isLast: boolean
}): JSX.Element {
  const [imgLoaded, setImgLoaded] = useState(false)

  return (
    <article
      className={`flex-none snap-start flex flex-col w-[68vw] 380:w-[220px] 480:w-[245px]${!isLast ? ' mr-5 border-r border-[rgba(95,89,82,0.15)]' : ''}`}
    >
      <p className="font-[family-name:var(--font-dm-sans)] text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-[#1e3599] mb-2 leading-none">
        Questurian Maps
      </p>

      <div className="aspect-square overflow-hidden bg-[#d7dcde]">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.title}
            className={`h-full w-full object-cover transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            fetchPriority={isPriority ? 'high' : 'auto'}
            loading={isPriority ? 'eager' : 'lazy'}
            onLoad={() => setImgLoaded(true)}
          />
        ) : null}
      </div>

      <h3 className="mt-3 font-editorial font-semibold text-[1.05rem] leading-[1.2] text-[#1a1a1a]">
        {item.title}
      </h3>
    </article>
  )
}

function MapGridCard({
  item,
  isPriority,
}: {
  item: FeaturedArticleTeaser
  isPriority: boolean
}): JSX.Element {
  const [imgLoaded, setImgLoaded] = useState(false)
  const imgSrc = item.imageUrlSquare ?? item.imageUrl

  return (
    <div className="city-four-side-card" style={{ background: '#fafaf8' }}>
      <div className="city-four-side-image">
        {imgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgSrc}
            alt={item.title}
            className={`relative z-10 h-full w-full object-cover transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            fetchPriority={isPriority ? 'high' : 'auto'}
            loading={isPriority ? 'eager' : 'lazy'}
            onLoad={() => setImgLoaded(true)}
          />
        ) : null}
      </div>
      <div className="city-four-side-copy">
        <p className="city-four-side-type">Questurian Maps</p>
        <h3 className="city-four-side-title">{item.title}</h3>
      </div>
    </div>
  )
}

export function QuestUrianMapsPreview({
  block,
}: HomepageBlockLayoutProps<CityHomepageArticleBlock>): JSX.Element | null {
  const items = block.items ?? []

  const scrollRef = useRef<HTMLDivElement>(null)

  if (items.length === 0) return null

  const row1 = items.slice(0, 3)
  const row2 = items.slice(3, 6)

  return (
    // PAGE-WIDTH RULE: every block section on this page must constrain its content
    // to 1400px and center it with mx-auto, while keeping the section background
    // full-width. Apply the inner wrapper pattern below to every new block section.
    <section className="relative py-10 bg-[#fafaf8]">
      <div className="mx-auto w-full max-w-[1400px]">

        {/* Editorial rule-on-sides header */}
        <div className="flex items-center gap-4 px-6 mb-8">
          <div className="flex-1 h-px bg-[#d6d0ca]" aria-hidden="true" />
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <MapPinIcon />
            <h2 className="font-display font-bold uppercase tracking-[0.2em] text-[#1e3599] text-[0.95rem] 768:text-[1.1rem] 1024:text-[1.2rem]">
              Questurian Maps
            </h2>
          </div>
          <div className="flex-1 h-px bg-[#d6d0ca]" aria-hidden="true" />
        </div>

        {/* Mobile: horizontal snap-scroll carousel */}
        <div className="768:hidden">
          <div
            ref={scrollRef}
            className="flex overflow-x-auto pl-6"
            style={
              {
                scrollSnapType: 'x mandatory',
                scrollPaddingLeft: '1.5rem',
                scrollbarWidth: 'none',
                WebkitOverflowScrolling: 'touch',
              } as React.CSSProperties
            }
          >
            {items.map((item, index) => (
              <MapCarouselCard
                key={`${item.title}-${index}`}
                item={item}
                isPriority={index === 0}
                isLast={index === items.length - 1}
              />
            ))}
            <div className="w-6 shrink-0" aria-hidden="true" />
          </div>
        </div>

        {/* Desktop: 2×3 compact grid using city-four-side-* classes */}
        <div className="hidden 768:block px-6">
          <div className="grid grid-cols-3 border-b border-[rgba(95,89,82,0.18)]">
            {row1.map((item, index) => (
              <div
                key={`r1-${item.title}-${index}`}
                className={index > 0 ? 'border-l border-[rgba(95,89,82,0.18)]' : ''}
              >
                <MapGridCard item={item} isPriority={index === 0} />
              </div>
            ))}
          </div>

          {row2.length > 0 ? (
            <div className="grid grid-cols-3">
              {row2.map((item, index) => (
                <div
                  key={`r2-${item.title}-${index}`}
                  className={index > 0 ? 'border-l border-[rgba(95,89,82,0.18)]' : ''}
                >
                  <MapGridCard item={item} isPriority={false} />
                </div>
              ))}
            </div>
          ) : null}
        </div>

      </div>
    </section>
  )
}
