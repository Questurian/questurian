import { curatedBlockRegistry } from '../block-registry'

// Which block types exist is owned by `curatedBlockRegistry` (block-registry/) — the former
// `CURATED_BLOCK_TYPES` array lived here and is now derived from the registry's `keys`.

// The subset whose public payload is formatted as articles (read-path public formatting).
// Kept separate from the publish-rule `behavior.isArticleBlock` flag: these are distinct
// concerns owned by adjacent registry fields.
export const PUBLIC_ARTICLE_BLOCK_TYPES: ReadonlySet<string> =
  curatedBlockRegistry.publicArticleBlockTypes
