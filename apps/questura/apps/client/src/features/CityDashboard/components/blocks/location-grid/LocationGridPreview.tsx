import { type JSX } from 'react'
import Link from 'next/link'

import type { LocationGridBlock, LocationGridItem, HomepageBlockLayoutProps } from '../../../types'
import { BLOCK_GUTTER_CLASS, BLOCK_MAX_WIDTH_CLASS } from '../BlockSection'

const MEDIA_ASPECT_CLASSES: Record<string, string> = {
  rectangle: 'h-28 768:h-36',
  square: 'aspect-square',
  portrait: 'aspect-[3/4]',
}

function mediaAspectClass(mediaAspect: string | null): string {
  return MEDIA_ASPECT_CLASSES[mediaAspect ?? 'rectangle'] ?? MEDIA_ASPECT_CLASSES.rectangle
}

function LocationCard({
  item,
  isPriority,
  aspectClass,
}: {
  item: LocationGridItem
  isPriority: boolean
  aspectClass: string
}): JSX.Element {
  const href = item.href ?? null
  const guideLabel =
    item.kicker?.trim() ||
    (item.level === 'neighborhood' ? 'Neighborhood guides' : 'Destination guides')
  const content = (
    <>
      {item.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.coverImageUrl}
          alt={item.coverImageAlt ?? item.title}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover/guide:scale-[1.025]"
          fetchPriority={isPriority ? 'high' : 'auto'}
          loading={isPriority ? 'eager' : 'lazy'}
        />
      ) : null}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(5,10,16,0.72) 0%, rgba(5,10,16,0.38) 50%, rgba(5,10,16,0.58) 100%)',
        }}
        aria-hidden="true"
      />
      <div className="absolute inset-x-3 top-2 z-20 flex flex-col items-center text-center text-white 768:inset-x-4 768:top-3 1024:inset-x-4 1024:top-4">
        <span className="mb-1 block h-3 w-px bg-white 768:h-4 1024:mb-1.5" aria-hidden="true" />
        <p className="font-editorial text-[0.48rem] font-bold uppercase tracking-[0.045em] 768:text-[0.52rem] 1024:text-[0.55rem]">
          {guideLabel}
        </p>
        <h3 className="mt-1 font-editorial text-[1.05rem] font-bold leading-none 768:text-[1.2rem] 1024:mt-1.5 1024:text-[1.3rem] 1280:text-[1.45rem]">
          {item.title}
        </h3>
        {item.description ? (
          <p className="mt-1 line-clamp-2 max-w-[24rem] font-[family-name:var(--font-dm-sans)] text-[0.6rem] leading-[1.2] text-white 768:mt-1.5 768:text-[0.68rem] 1024:line-clamp-3 1024:text-[0.72rem] 1024:leading-[1.25] 1280:text-[0.78rem]">
            {item.description}
          </p>
        ) : null}
      </div>
    </>
  )
  return (
    <article
      className={`relative w-full ${aspectClass} 1024:h-auto 1024:aspect-[3/4] overflow-hidden bg-charcoal`}
    >
      {href ? (
        <Link
          href={href}
          aria-label={`Open ${item.title}`}
          data-no-hover-underline
          className="group/guide absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          {content}
        </Link>
      ) : (
        content
      )}
    </article>
  )
}

export function LocationGridPreview({
  block,
}: HomepageBlockLayoutProps<LocationGridBlock>): JSX.Element | null {
  const items = block.selection?.items ?? []
  if (items.length === 0) return null

  const heading = block.sectionHeading?.trim() || null
  const subheading = block.sectionSubheading?.trim() || null
  const aspectClass = mediaAspectClass(block.mediaAspect)

  return (
    <section className="bg-[#f5f0e8]">
      {heading || subheading ? (
        <div className={`${BLOCK_MAX_WIDTH_CLASS} ${BLOCK_GUTTER_CLASS} pt-8 pb-4`}>
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
      ) : null}

      <div className={`${BLOCK_MAX_WIDTH_CLASS} ${BLOCK_GUTTER_CLASS}`}>
        <div className="grid grid-cols-1 768:grid-cols-2 1024:grid-cols-4">
          {items.map((item, index) => (
            <LocationCard
              key={item.id}
              item={item}
              isPriority={index === 0}
              aspectClass={aspectClass}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
