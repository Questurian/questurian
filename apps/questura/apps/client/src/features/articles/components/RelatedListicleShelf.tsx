'use client'

import { useRef, useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import type { RelatedMapsArticleTeaser } from '@/features/articles/lib/fetchRelatedMapsArticles'

interface RelatedListicleShelfProps {
  articles: RelatedMapsArticleTeaser[]
  country: string
  city?: string | null
}

export function RelatedListicleShelf({
  articles,
  country,
  city,
}: RelatedListicleShelfProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const check = () => {
      setCanScrollLeft(node.scrollLeft > 0)
      setCanScrollRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 1)
    }
    check()
    node.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check, { passive: true })
    return () => {
      node.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }
  }, [])

  if (articles.length === 0) return null

  function scrollByGroup(direction: -1 | 1) {
    const node = scrollRef.current
    if (!node) return
    node.scrollBy({
      left: direction * Math.max(180, node.clientWidth - 16),
      behavior: 'smooth',
    })
  }

  return (
    <section
      aria-labelledby="related-listicles-heading"
      className="related-maps-shelf relative hidden shrink-0 overflow-hidden border-t border-black/10 bg-background px-4 pt-3 pb-3 1024:block"
    >
      <div className="flex items-center gap-2.5 mb-2">
        <h2
          id="related-listicles-heading"
          className="text-[9px] font-semibold tracking-[0.14em] uppercase text-foreground/40 whitespace-nowrap"
        >
          Related Guides
        </h2>
        <div className="flex-1 h-px bg-black/10" />
      </div>

      <div className="relative">
        {canScrollLeft && (
          <button
            type="button"
            aria-label="Show previous related articles"
            className="absolute -left-1 top-1/2 z-10 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-black/12 bg-background/95 text-foreground shadow-sm transition-colors hover:bg-white"
            onClick={() => scrollByGroup(-1)}
          >
            <ChevronLeft aria-hidden="true" size={13} strokeWidth={1.8} />
          </button>
        )}

        <div
          ref={scrollRef}
          className="related-maps-scroll flex h-[88px] items-center gap-2 overflow-x-auto"
        >
          {articles.map((article) => {
            const imageUrl = article.header?.featuredImage?.url ?? null
            const imageAlt = article.header?.featuredImage?.alt_text ?? ''
            const href = city
              ? `/${country}/${city}/${article.routeType}/${article.slug}`
              : `/${country}/${article.routeType}/${article.slug}`

            return (
              <Link
                key={`${article.routeType}-${article.id}`}
                href={href}
                className="related-maps-card group block min-w-0 snap-start"
              >
                <article className="flex min-w-0 items-center gap-2">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-sm bg-[#e5e0d8]">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageUrl}
                        alt={imageAlt}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : null}
                  </div>
                  <p className="min-w-0 flex-1 text-[0.67rem] font-medium leading-[1.25] text-foreground/60 transition-colors group-hover:text-foreground [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] [overflow-wrap:anywhere] overflow-hidden">
                    {article.title}
                  </p>
                </article>
              </Link>
            )
          })}
        </div>

        {canScrollRight && (
          <button
            type="button"
            aria-label="Show more related articles"
            className="absolute -right-1 top-1/2 z-10 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-black/12 bg-background/95 text-foreground shadow-sm transition-colors hover:bg-white"
            onClick={() => scrollByGroup(1)}
          >
            <ChevronRight aria-hidden="true" size={13} strokeWidth={1.8} />
          </button>
        )}
      </div>
    </section>
  )
}
