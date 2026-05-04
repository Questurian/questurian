import { type JSX } from 'react'

import type { LocationGridBlock, LocationGridItem, HomepageBlockLayoutProps } from '../../../types'

function LocationCard({ item, isPriority }: { item: LocationGridItem; isPriority: boolean }): JSX.Element {
  return (
    <article className="relative w-full h-28 768:h-36 1024:h-40 overflow-hidden bg-[#1a1a1a]">
      {item.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.coverImageUrl}
          alt={item.coverImageAlt ?? item.title}
          className="absolute inset-0 h-full w-full object-cover"
          fetchPriority={isPriority ? 'high' : 'auto'}
          loading={isPriority ? 'eager' : 'lazy'}
        />
      ) : null}

      {/* Dark gradient overlay */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.18) 55%, transparent 100%)' }}
        aria-hidden="true"
      />

      {/* Location name */}
      <div className="absolute bottom-0 left-0 px-5 pb-5">
        <p className="font-editorial font-bold text-white leading-none text-[2rem]">
          {item.title}
        </p>
        {item.subtitle ? (
          <p className="mt-1 font-[family-name:var(--font-dm-sans)] text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-white/70">
            {item.subtitle}
          </p>
        ) : null}
      </div>
    </article>
  )
}

export function LocationGridPreview({ block }: HomepageBlockLayoutProps<LocationGridBlock>): JSX.Element | null {
  const items = block.selection?.items ?? []
  if (items.length === 0) return null

  const heading = block.sectionHeading?.trim() || null
  const subheading = block.sectionSubheading?.trim() || null

  return (
    <section className="bg-[#f5f0e8]">
      {(heading || subheading) ? (
        <div className="mx-auto w-full max-w-[1400px] px-6 pt-8 pb-4">
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

      <div className="mx-auto w-full max-w-[1400px] 1024:max-w-none grid grid-cols-1 768:grid-cols-2 1024:grid-cols-4">
        {items.map((item, index) => (
          <LocationCard key={item.id} item={item} isPriority={index === 0} />
        ))}
      </div>
    </section>
  )
}
