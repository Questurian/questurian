import { formatPublicHomepageBlock } from '../lib/format-public-block'
import { resolvePageBlocks } from './resolve-blocks'

type LocationContext = { country: string; city: string }

export function formatPublicLocationHomepageDoc(
  resolvedBlocks: Awaited<ReturnType<typeof resolvePageBlocks>>,
  location?: LocationContext,
) {
  return {
    pageBlocks: resolvedBlocks.flatMap((block) => {
      const publicBlock = formatPublicHomepageBlock(block, location)
      return publicBlock ? [publicBlock] : []
    }),
  }
}
