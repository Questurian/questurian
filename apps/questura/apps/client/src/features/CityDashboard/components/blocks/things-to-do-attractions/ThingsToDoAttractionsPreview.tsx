'use client'

import { useEffect, useRef, useState, type JSX } from 'react'

import type {
  ThingsToDoAttractionsBlock,
  ThingsToDoAttractionItem,
  HomepageBlockLayoutProps,
} from '../../../types'
import { BlockSection, BLOCK_GUTTER_CLASS } from '../BlockSection'
import { useSnapCarousel } from '../useSnapCarousel'

const PRICE_LEVEL_MAP: Record<string, string> = {
  '1': '$',
  '2': '$$',
  '3': '$$$',
  '4': '$$$$',
}

function formatPriceLevel(value: string | null): string | null {
  if (!value) return null
  return PRICE_LEVEL_MAP[value] ?? value
}

function AttractionCard({
  item,
  isPriority,
  isLast,
}: {
  item: ThingsToDoAttractionItem
  isPriority: boolean
  isLast: boolean
}): JSX.Element {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [imgLoaded, setImgLoaded] = useState(false)

  // The image is server-rendered at opacity-0 and faded in via onLoad. If it
  // finishes loading (e.g. from cache) before hydration attaches the handler,
  // the load event is missed and the card stays blank. Reconcile on mount.
  useEffect(() => {
    const image = imgRef.current
    if (image && image.complete && image.naturalWidth > 0) {
      setImgLoaded(true)
    }
  }, [item.imageUrl])

  const priceLabel = formatPriceLevel(item.priceLevel)
  const meta = [priceLabel, item.location?.toUpperCase()].filter(Boolean).join(' | ')

  return (
    <article
      className={`flex-none snap-always flex flex-col w-[calc(100vw-5.25rem)] 380:w-[291px] 768:w-[340px] 1024:w-[400px] 1280:w-[460px] ${isLast ? 'snap-end' : 'snap-start'}`}
    >
      <div className="aspect-[3/2] overflow-hidden bg-[#d7dcde]">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={item.imageUrl}
            alt={item.title}
            className={`h-full w-full object-cover transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            fetchPriority={isPriority ? 'high' : 'auto'}
            loading={isPriority ? 'eager' : 'lazy'}
            onLoad={() => setImgLoaded(true)}
          />
        ) : null}
      </div>

      <div className="pt-4 flex flex-col flex-1">
        <h3 className="font-editorial text-[1.35rem] font-semibold leading-[1.1] text-[#1a1a1a]">
          {item.title}
        </h3>

        {meta ? (
          <p className="mt-2 font-[family-name:var(--font-dm-sans)] text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#C65D3B]">
            {meta}
          </p>
        ) : null}

        {item.type ? (
          <p className="mt-1 font-[family-name:var(--font-dm-sans)] text-[0.68rem] uppercase tracking-[0.08em] text-[#5f5952]">
            {item.type}
          </p>
        ) : null}
      </div>
    </article>
  )
}

export function ThingsToDoAttractionsPreview({
  block,
}: HomepageBlockLayoutProps<ThingsToDoAttractionsBlock>): JSX.Element | null {
  const items = block.selection?.items ?? []

  const { scrollRef, pageCount, activePage, scrollToPage, scrollByPage } = useSnapCarousel(
    items.length,
  )

  const heading = block.sectionHeading?.trim() || null
  const subheading = block.sectionSubheading?.trim() || null

  // Pages are measured after mount; until then fall back to one page per item
  // so the server-rendered controls match the multi-item case.
  const dotCount = pageCount > 0 ? pageCount : items.length
  const canScrollNext = pageCount > 0 ? activePage < pageCount - 1 : items.length > 1

  if (items.length === 0) return null

  return (
    // Flush BlockSection: the carousel bleeds to the wrapper edge, so the
    // gutter is applied per inner element via BLOCK_GUTTER_CLASS instead.
    <BlockSection className="py-8 bg-[#f5f0e8]" flush aria-label="Things to do attractions">
      {/* Header */}
      <div className={`flex items-center justify-between gap-3 ${BLOCK_GUTTER_CLASS} mb-5`}>
        <div className="flex-1 min-w-0">
          {heading ? (
            <h2 className="font-editorial font-semibold leading-tight text-[#1a1a1a] text-[1.4rem] 768:text-[1.7rem] 1024:text-[2rem] 1280:text-[2.3rem]">
              {heading}
            </h2>
          ) : null}
          {subheading ? (
            <p className="mt-1 font-[family-name:var(--font-dm-sans)] text-[0.75rem] 768:text-[0.85rem] 1024:text-[0.9rem] text-[#3f3a35] leading-relaxed">
              {subheading}
            </p>
          ) : null}
        </div>

        {items.length > 1 ? (
          <div className="flex items-center gap-1 768:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => scrollByPage(-1)}
              disabled={activePage === 0}
              aria-label="Previous attractions"
              className="
                flex items-center justify-center transition-colors
                w-9 h-9 text-[1.5rem] text-[#1a1a1a] disabled:text-[#c8c2b8]
                768:w-10 768:h-10 768:bg-[#1a1a1a] 768:text-white 768:text-[1.3rem]
                768:hover:bg-[#2c2c2c] 768:disabled:bg-[#d4cfc8] 768:disabled:text-[#a09890]
                1024:w-12 1024:h-12 1024:text-[1.6rem]
              "
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => scrollByPage(1)}
              disabled={!canScrollNext}
              aria-label="Next attractions"
              className="
                flex items-center justify-center transition-colors
                w-9 h-9 text-[1.5rem] text-[#1a1a1a] disabled:text-[#c8c2b8]
                768:w-10 768:h-10 768:bg-[#1a1a1a] 768:text-white 768:text-[1.3rem]
                768:hover:bg-[#2c2c2c] 768:disabled:bg-[#d4cfc8] 768:disabled:text-[#a09890]
                1024:w-12 1024:h-12 1024:text-[1.6rem]
              "
            >
              ›
            </button>
          </div>
        ) : null}
      </div>

      {/* Carousel */}
      <div className="relative">
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto pl-[var(--block-gutter)]"
          style={
            {
              scrollSnapType: 'x mandatory',
              scrollPaddingLeft: 'var(--block-gutter)',
              scrollPaddingRight: 'var(--block-gutter)',
              scrollbarWidth: 'none',
              WebkitOverflowScrolling: 'touch',
            } as React.CSSProperties
          }
        >
          {items.map((item, index) => (
            <AttractionCard
              key={item.id}
              item={item}
              isPriority={index === 0}
              isLast={index === items.length - 1}
            />
          ))}
          <div className="w-[var(--block-gutter)] shrink-0" aria-hidden="true" />
        </div>
        <div
          className="absolute inset-y-0 left-0 w-[var(--block-gutter)] bg-[#f5f0e8] pointer-events-none"
          aria-hidden="true"
        />
      </div>

      {/* Dot indicators — one per scroll page, not per item */}
      {dotCount > 1 ? (
        <div className="flex justify-center gap-2.5 mt-6">
          {Array.from({ length: dotCount }, (_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => scrollToPage(index)}
              aria-label={`Go to slide ${index + 1}`}
              className={`w-2 h-2 rounded-full transition-colors duration-200 ${
                index === activePage ? 'bg-[#1a1a1a]' : 'bg-[#c8c2b8]'
              }`}
            />
          ))}
        </div>
      ) : null}
    </BlockSection>
  )
}
