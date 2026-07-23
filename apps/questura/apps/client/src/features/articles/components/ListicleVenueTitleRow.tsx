import type { JSX } from 'react'
import { Bookmark } from 'lucide-react'

const MAX_PRICE_LEVEL = 4

export function ListicleVenueTitleRow({
  title,
  priceLevel = null,
  priceDescriptor,
}: {
  title: string
  /** Omit (attractions) to hide the price tier; stays and dining pass 1-4 to show it. */
  priceLevel?: number | null
  priceDescriptor?: string
}): JSX.Element {
  const dollars = priceLevel ? '$'.repeat(priceLevel) : null
  const priceLabel = dollars
    ? priceDescriptor
      ? `${dollars} — ${priceDescriptor}`
      : `${dollars} — Price level ${priceLevel} of ${MAX_PRICE_LEVEL}`
    : null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <h2 className="text-[1.15rem] font-bold leading-[1.08] tracking-[-0.045em] text-foreground [font-family:var(--font-editorial-serif)] 380:text-[1.35rem] 480:text-[1.5rem] 550:text-[1.55rem] sm:text-[1.7rem] 768:text-[1.8rem]">
        {title}
      </h2>
      <div className="inline-flex shrink-0 items-center gap-2">
        <span className="text-[0.7rem] leading-none text-foreground/30" aria-hidden>
          •
        </span>
        {priceLevel && priceLabel ? (
          <>
            <span
              className="group relative inline-flex cursor-default items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maps-listicle-accent)]"
              tabIndex={0}
              aria-label={priceLabel}
            >
              <span
                className="inline-flex items-center font-[var(--font-display)] text-[1rem] font-normal leading-none tracking-[-0.025em] 380:text-[1.05rem] 480:text-[1.1rem] sm:text-[1.15rem]"
                aria-hidden
              >
                {Array.from({ length: MAX_PRICE_LEVEL }, (_, dollarIndex) => (
                  <span
                    key={dollarIndex}
                    className={
                      dollarIndex < priceLevel
                        ? 'text-foreground transition-colors group-hover:text-[var(--maps-listicle-accent)] group-focus-visible:text-[var(--maps-listicle-accent)]'
                        : 'text-foreground/18 transition-colors group-hover:text-[color:rgb(var(--maps-listicle-accent-rgb)/0.35)] group-focus-visible:text-[color:rgb(var(--maps-listicle-accent-rgb)/0.35)]'
                    }
                  >
                    $
                  </span>
                ))}
              </span>
              <span className="pointer-events-none absolute bottom-[calc(100%+0.45rem)] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-sm border border-foreground/12 bg-background px-2 py-1 font-[var(--font-dm-sans)] text-[0.68rem] font-medium tracking-normal text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                {priceLabel}
              </span>
            </span>
            <span className="text-[0.7rem] leading-none text-foreground/30" aria-hidden>
              •
            </span>
          </>
        ) : null}
        <button
          type="button"
          className="group relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-sm p-0.5 text-foreground/55 transition-colors hover:text-[var(--maps-listicle-accent)] focus-visible:text-[var(--maps-listicle-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maps-listicle-accent)]"
          aria-label={`Save ${title}`}
        >
          <Bookmark className="size-[1.05rem] fill-transparent transition-[fill] group-hover:fill-current group-focus-visible:fill-current 380:size-[1.1rem] 480:size-[1.15rem] sm:size-[1.2rem] 768:size-[1.25rem]" strokeWidth={1.7} aria-hidden />
          <span className="pointer-events-none absolute bottom-[calc(100%+0.45rem)] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-sm border border-foreground/12 bg-background px-2 py-1 font-[var(--font-dm-sans)] text-[0.68rem] font-medium tracking-normal text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            Save
          </span>
        </button>
      </div>
    </div>
  )
}
