'use client'

import { useCallback, useEffect, useRef, useState, type JSX } from 'react'

import type { TourGridBlock, TourGridItem, HomepageBlockLayoutProps } from '../../../types'

function TourCard({ item, isPriority, isLast }: { item: TourGridItem; isPriority: boolean; isLast: boolean }): JSX.Element {
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

  const meta = [item.priceLevel, item.location?.toUpperCase()].filter(Boolean).join(' | ')

  return (
    <article className={`flex-none snap-always flex flex-col w-[calc(100vw-5.25rem)] 380:w-[291px] 768:w-[340px] 1024:w-[400px] 1280:w-[460px] ${isLast ? 'snap-end' : 'snap-start'}`}>
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

        <div className="mt-auto pt-5">
          {item.slug ? (
            <a
              href={item.slug}
              target="_blank"
              rel="noopener noreferrer"
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

export function TourGridPreview({ block }: HomepageBlockLayoutProps<TourGridBlock>): JSX.Element | null {
  const items = block.selection?.items ?? []

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

  if (items.length === 0) return null

  return (
    // PAGE-WIDTH RULE: every block section on this page must constrain its content
    // to 1400px and center it with mx-auto, while keeping the section background
    // full-width. Apply the inner wrapper pattern below to every new block section.
    <section className="relative py-8 bg-[#f5f0e8]">
      <div className="mx-auto w-full max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-6 mb-5">
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
              onClick={() => scrollBy(-1)}
              disabled={activeIndex === 0}
              aria-label="Previous tours"
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
              onClick={() => scrollBy(1)}
              disabled={activeIndex >= items.length - 1}
              aria-label="Next tours"
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
          className="flex gap-3 overflow-x-auto pl-6"
          style={{ scrollSnapType: 'x mandatory', scrollPaddingLeft: '1.5rem', scrollPaddingRight: '1.5rem', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {items.map((item, index) => (
            <TourCard key={item.id} item={item} isPriority={index === 0} isLast={index === items.length - 1} />
          ))}
          <div className="w-6 shrink-0" aria-hidden="true" />
        </div>
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
      </div>
    </section>
  )
}
