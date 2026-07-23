'use client'

import { useEffect, useRef, useState, type JSX, type UIEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ShimmerImage } from '@/components/media/ShimmerImage'
import type { ListicleItemImage } from '@/features/articles/lib/listicleItemHelpers'

export function ListiclePhotoCarousel({
  images,
}: {
  images: ListicleItemImage[]
}): JSX.Element | null {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const imageKey = images.map((image) => image.url).join('|')

  useEffect(() => {
    setActiveIndex(0)
    viewportRef.current?.scrollTo({ left: 0 })
  }, [imageKey])

  if (images.length === 0) return null

  function scrollToImage(index: number): void {
    const viewport = viewportRef.current
    if (!viewport) return

    const nextIndex = Math.max(0, Math.min(images.length - 1, index))
    viewport.scrollTo({
      left: nextIndex * viewport.clientWidth,
      behavior: 'smooth',
    })
    setActiveIndex(nextIndex)
  }

  function syncActiveImage(event: UIEvent<HTMLDivElement>): void {
    const viewport = event.currentTarget
    if (viewport.clientWidth === 0) return
    setActiveIndex(
      Math.min(images.length - 1, Math.round(viewport.scrollLeft / viewport.clientWidth)),
    )
  }

  const hasMultipleImages = images.length > 1

  return (
    <div
      className="relative overflow-hidden rounded-sm bg-foreground/[0.04]"
      role={hasMultipleImages ? 'region' : undefined}
      aria-roledescription={hasMultipleImages ? 'carousel' : undefined}
      aria-label={hasMultipleImages ? 'Venue photos' : undefined}
    >
      <div
        ref={viewportRef}
        className={`listicle-photo-carousel flex w-full snap-x snap-mandatory overflow-x-auto ${
          hasMultipleImages ? 'scroll-smooth' : ''
        }`}
        onScroll={hasMultipleImages ? syncActiveImage : undefined}
      >
        {images.map((image, index) => (
          <div
            key={`${image.url}-${index}`}
            className="aspect-[16/10] w-full min-w-full snap-center 380:aspect-[4/3] 480:aspect-[3/2] sm:aspect-[16/9]"
            role={hasMultipleImages ? 'group' : undefined}
            aria-roledescription={hasMultipleImages ? 'slide' : undefined}
            aria-label={hasMultipleImages ? `${index + 1} of ${images.length}` : undefined}
          >
            <ShimmerImage
              src={image.url}
              alt={image.alt}
              width={1200}
              height={675}
              sizes="(min-width: 768px) 700px, 100vw"
              className="h-full w-full object-cover"
              wrapperClassName="h-full w-full"
              loading="lazy"
              decoding="async"
            />
          </div>
        ))}
      </div>

      {hasMultipleImages ? (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            disabled={activeIndex === 0}
            className="absolute left-2 top-1/2 z-[1] inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/35 bg-black/45 text-white shadow-sm transition enabled:hover:bg-black/60 disabled:opacity-30 480:left-3 480:size-10"
            onClick={() => scrollToImage(activeIndex - 1)}
          >
            <ChevronLeft className="size-5" strokeWidth={1.8} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            disabled={activeIndex === images.length - 1}
            className="absolute right-2 top-1/2 z-[1] inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/35 bg-black/45 text-white shadow-sm transition enabled:hover:bg-black/60 disabled:opacity-30 480:right-3 480:size-10"
            onClick={() => scrollToImage(activeIndex + 1)}
          >
            <ChevronRight className="size-5" strokeWidth={1.8} aria-hidden />
          </button>
          <span
            className="absolute bottom-2 right-2 z-[1] rounded-full bg-black/55 px-2 py-1 text-[10px] font-semibold leading-none text-white 480:bottom-3 480:right-3 480:text-[11px]"
            aria-live="polite"
          >
            {activeIndex + 1} / {images.length}
          </span>
        </>
      ) : null}
    </div>
  )
}
