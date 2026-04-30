import type { CityHomepageLocation } from '../lib/fetchCityHomepage'

interface CityHomepageContentProps {
  location: CityHomepageLocation | null
  pageBlocks: unknown[]
}

export function CityHomepageContent({ location, pageBlocks }: CityHomepageContentProps) {
  // Block rendering will be built out here as each block type gets a UI component.
  // Returning null for now — the SSR metadata (generateMetadata) and data-fetch
  // plumbing are already wired up regardless of what this renders.
  void location
  void pageBlocks
  return null
}
