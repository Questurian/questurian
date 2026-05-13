import { formatPublicHomepageBlock } from '../lib/format-public-block'
import { resolvePageBlocks } from './resolve-blocks'

export function formatPublicLocationHomepageDoc(
  resolvedBlocks: Awaited<ReturnType<typeof resolvePageBlocks>>,
) {
  return {
    pageBlocks: resolvedBlocks.map((block) => formatPublicHomepageBlock(block)),
  }
}
