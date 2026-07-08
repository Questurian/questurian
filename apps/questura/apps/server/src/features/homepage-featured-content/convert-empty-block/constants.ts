import { curatedBlockRegistry } from '../block-registry'

/**
 * Single list: block may use POST …/blocks/convert when `items` empty.
 *
 * When adding curated homepage block type:
 * 1. Set `convertibleWhenEmpty` in `block-registry/registry.ts`.
 * 2. Mirror frontend target metadata in ai-blog-writer `pageBlocks.ts`.
 *
 * Editor lists current block type plus this list so empty blocks can resize slots or change type
 * (POST …/blocks/convert).
 */
export const HOMEPAGE_EMPTY_CONVERT_SOURCE_BLOCK_TYPES =
  curatedBlockRegistry.emptyConvertSourceBlockTypes

export type HomepageEmptyConvertSourceBlockType =
  (typeof HOMEPAGE_EMPTY_CONVERT_SOURCE_BLOCK_TYPES)[number]
