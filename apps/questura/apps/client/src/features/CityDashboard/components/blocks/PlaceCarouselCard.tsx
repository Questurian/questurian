'use client'

import {
  Baby,
  Briefcase,
  Building2,
  Coffee,
  Crown,
  Dumbbell,
  Footprints,
  Gem,
  HeartHandshake,
  Moon,
  Ticket,
  UtensilsCrossed,
  Waves,
  Wifi,
  Wine,
  type LucideIcon,
} from 'lucide-react'
import type { JSX } from 'react'

import type { PlaceCardHighlight } from '../../types'
import { CAROUSEL_CARD_WIDTH_CLASS } from './BlockSection'
import { NavigableImageTarget } from './NavigableImageTarget'
import { PublicImage } from '@/components/media/PublicImage'
import { BLOCK_IMAGE_SIZES } from './blockImageSizes'

const PRICE_LEVEL_MAP: Record<string, string> = {
  '1': '$',
  '2': '$'.repeat(2),
  '3': '$'.repeat(3),
  '4': '$'.repeat(4),
}

const HIGHLIGHT_ICONS: Record<string, LucideIcon> = {
  luxury: Crown,
  boutique: Gem,
  quiet: Moon,
  social: Wine,
  'family-friendly': HeartHandshake,
  'business-friendly': Briefcase,
  walkability: Footprints,
  pool: Waves,
  rooftop: Building2,
  breakfast: Coffee,
  gym: Dumbbell,
  restaurant: UtensilsCrossed,
  kids: Baby,
  wifi: Wifi,
  booking: Ticket,
  provider: Ticket,
}

function formatPriceLevel(value: string | null): string | null {
  if (!value) return null
  return PRICE_LEVEL_MAP[value] ?? value
}

function formatType(value: string | null): string | null {
  if (!value) return null
  return value.replace(/-/g, ' ')
}

export type PlaceCarouselCardProps = {
  title: string
  imageUrl: string | null
  isPriority: boolean
  isLast: boolean
  priceLevel: string | null
  location: string | null
  type: string | null
  /** `amount` = a real tour price, shown large. Default is hotel-style ticks. */
  priceAppearance?: 'tier' | 'amount'
  highlights?: PlaceCardHighlight[]
  ctaHref?: string | null
  ctaLabel?: string
  ctaExternal?: boolean
}

export function PlaceCarouselCard({
  title,
  imageUrl,
  isPriority,
  isLast,
  priceLevel,
  location,
  type,
  priceAppearance = 'tier',
  highlights = [],
  ctaHref = null,
  ctaLabel = 'Book Now',
  ctaExternal = false,
}: PlaceCarouselCardProps): JSX.Element {
  const priceLabel = formatPriceLevel(priceLevel)
  const meta = [priceLabel, location?.toUpperCase()].filter(Boolean).join(' | ')
  const typeLabel = formatType(type)
  const showType =
    Boolean(typeLabel) && typeLabel?.toLowerCase() !== 'tour' && highlights.length === 0
  const visibleHighlights = highlights.slice(0, 3)
  const isAmount = priceAppearance === 'amount'

  return (
    <article
      className={`city-article-card flex-none snap-always flex flex-col ${CAROUSEL_CARD_WIDTH_CLASS} ${isLast ? 'snap-end' : 'snap-start'}`}
    >
      <div className="city-article-image-shell relative aspect-[3/2] overflow-hidden bg-[#d7dcde]">
        {imageUrl ? (
          <PublicImage
            src={imageUrl}
            alt={title}
            className="relative z-10 h-full w-full object-cover"
            fetchPriority={isPriority ? 'high' : 'auto'}
            loading={isPriority ? 'eager' : 'lazy'}
            sizes={BLOCK_IMAGE_SIZES.carouselCard}
          />
        ) : null}
        <NavigableImageTarget
          href={ctaHref}
          label={`${ctaLabel}: ${title}`}
          external={ctaExternal}
        />
      </div>

      <div className="city-article-content flex flex-1 flex-col pt-4">
        <h3 className="font-editorial text-[1.35rem] font-semibold leading-[1.1] text-foreground">
          {ctaHref ? (
            <a
              href={ctaHref}
              {...(ctaExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {title}
            </a>
          ) : (
            title
          )}
        </h3>

        {isAmount && priceLabel ? (
          <p className="mt-2 font-editorial text-[1.2rem] font-semibold leading-none text-foreground">
            {priceLabel}
          </p>
        ) : null}

        {isAmount && location ? (
          <p className="mt-2 font-[family-name:var(--font-dm-sans)] text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-accent">
            {location}
          </p>
        ) : null}

        {!isAmount && meta ? (
          <p className="mt-2 font-[family-name:var(--font-dm-sans)] text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-accent">
            {meta}
          </p>
        ) : null}

        {visibleHighlights.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1.5">
            {visibleHighlights.map((highlight) => {
              const Icon = HIGHLIGHT_ICONS[highlight.key]
              return (
                <li
                  key={`${highlight.key}:${highlight.label}`}
                  className="flex items-center gap-2 font-[family-name:var(--font-dm-sans)] text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-foreground"
                >
                  {Icon ? (
                    <Icon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                  ) : null}
                  {highlight.label}
                </li>
              )
            })}
          </ul>
        ) : showType ? (
          <p className="mt-1 font-[family-name:var(--font-dm-sans)] text-[0.68rem] uppercase tracking-[0.08em] text-[#5f5952]">
            {typeLabel}
          </p>
        ) : null}

        {ctaHref ? (
          <div className="mt-auto pt-5">
            <a
              href={ctaHref}
              {...(ctaExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="block w-full bg-[#1a1a1a] text-white text-center font-[family-name:var(--font-dm-sans)] text-[0.68rem] font-semibold uppercase tracking-[0.14em] py-3.5 transition-colors hover:bg-[#2c2c2c]"
            >
              {ctaLabel}
            </a>
          </div>
        ) : null}
      </div>
    </article>
  )
}
