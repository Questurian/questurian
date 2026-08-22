import type { JSX, ReactNode } from 'react'

export const LISTICLE_MAP_REGION_SELECTOR = '[data-listicle-map-region]'

/** Marks the article content whose trailing edge controls the mobile map UI. */
export function ListicleMapRegion({
  children,
}: {
  children: ReactNode
}): JSX.Element {
  return <div data-listicle-map-region="">{children}</div>
}
