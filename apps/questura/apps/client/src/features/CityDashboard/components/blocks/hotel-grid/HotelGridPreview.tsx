'use client'

import { useCallback, useEffect, useRef, useState, type JSX } from 'react'

import type { HotelGridBlock, HotelGridItem, HomepageBlockLayoutProps } from '../../../types'

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

function HotelCard({ item, isPriority, isLast }: { item: HotelGridItem; isPriority: boolean; isLast: boolean }): JSX.Element {
  const [imgLoaded, setImgLoaded] = useState(false)

  const priceLabel = formatPriceLevel(item.priceLevel)
  const meta = [priceLabel, item.location?.toUpperCase()].filter(Boolean).join(' | ')

  return (
    <article className={`flex-none w-[291px] ${isLast ? 'snap-end' : 'snap-start'} snap-always flex flex-col`}>
      <div className="aspect-[3/2] overflow-hidden bg-[#d7dcde]">
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

        <div className="mt-auto pt-5">
          {item.slug ? (
            <a
              href={`/accommodations/${item.slug}`}
              className="block w-full bg-[#1a1a1a] text-white text-center font-[family-name:var(--font-dm-sans)] text-[0.68rem] font-semibold uppercase tracking-[0.14em] py-3.5 transition-colors hover:bg-[#2c2c2c]"
            >
              Book Now
            </a>
          ) : (
            <button
              type="button"
              className="block w-full bg-[#1a1a1a] text-white text-center font-[family-name:var(--font-dm-sans)] text-[0.68rem] font-semibold uppercase tracking-[0.14em] py-3.5 transition-colors hover:bg-[#2c2c2c] cursor-pointer"
            >
              Book Now
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

export function HotelGridPreview({ block }: HomepageBlockLayoutProps<HotelGridBlock>): JSX.Element | null {
  const items = block.selection?.items ?? []
  if (items.length === 0) return null

  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const heading = block.sectionHeading?.trim() || null
  const subheading = block.sectionSubheading?.trim() || null

  const scrollToIndex = useCallback((index: number) => {
    const container = scrollRef.current
    if (!container) return
    const card = container.children[index] as HTMLElement | undefined
    if (!card) return
    const paddingLeft = parseFloat(getComputedStyle(container).paddingLeft) || 0
    container.scrollTo({ left: card.offsetLeft - paddingLeft, behavior: 'smooth' })
    setActiveIndex(index)
  }, [])

  const scrollBy = useCallback((direction: -1 | 1) => {
    const next = Math.max(0, Math.min(items.length - 1, activeIndex + direction))
    scrollToIndex(next)
  }, [activeIndex, items.length, scrollToIndex])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const handleScroll = () => {
      const first = container.children[0] as HTMLElement | null
      const second = container.children[1] as HTMLElement | null
      if (!first) return
      const step = second ? second.offsetLeft - first.offsetLeft : first.offsetWidth
      if (step === 0) return
      setActiveIndex(Math.round(container.scrollLeft / step))
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <section className="relative py-8 bg-[#f5f0e8]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-6 mb-5">
        <div className="flex-1 min-w-0">
          {heading ? (
            <h2 className="font-editorial text-[1.4rem] font-semibold leading-tight text-[#1a1a1a]">
              {heading}
            </h2>
          ) : null}
          {subheading ? (
            <p className="mt-1 font-[family-name:var(--font-dm-sans)] text-[0.75rem] text-[#3f3a35] leading-relaxed">
              {subheading}
            </p>
          ) : null}
        </div>

        {items.length > 1 ? (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              disabled={activeIndex === 0}
              aria-label="Previous hotels"
              className="flex items-center justify-center w-9 h-9 text-[1.4rem] text-[#1a1a1a] disabled:text-[#c8c2b8] transition-colors"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              disabled={activeIndex >= items.length - 1}
              aria-label="Next hotels"
              className="flex items-center justify-center w-9 h-9 text-[1.4rem] text-[#1a1a1a] disabled:text-[#c8c2b8] transition-colors"
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
          className="flex gap-3 overflow-x-auto pl-6"
          style={{ scrollSnapType: 'x mandatory', scrollPaddingLeft: '1.5rem', scrollPaddingRight: '1.5rem', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {items.map((item, index) => (
            <HotelCard key={item.id} item={item} isPriority={index === 0} isLast={index === items.length - 1} />
          ))}
          <div className="w-6 shrink-0" aria-hidden="true" />
        </div>
        {/* Left edge mask — covers peeking previous card */}
        <div className="absolute inset-y-0 left-0 w-6 bg-[#f5f0e8] pointer-events-none" aria-hidden="true" />
      </div>

      {/* Dot indicators */}
      {items.length > 1 ? (
        <div className="flex justify-center gap-2.5 mt-6">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollToIndex(index)}
              aria-label={`Go to ${item.title}`}
              className={`w-2 h-2 rounded-full transition-colors duration-200 ${
                index === activeIndex ? 'bg-[#1a1a1a]' : 'bg-[#c8c2b8]'
              }`}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}
