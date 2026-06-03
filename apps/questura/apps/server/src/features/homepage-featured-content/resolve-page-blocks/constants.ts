// Which block types exist is owned by `curatedBlockRegistry` (block-registry/) — the former
// `CURATED_BLOCK_TYPES` array lived here and is now derived from the registry's `keys`.

// The subset whose public payload is formatted as articles (read-path public formatting).
// Kept separate from the publish-rule `isArticleBlock` registry flag: these are distinct
// concerns that happen to share membership today.
export const PUBLIC_ARTICLE_BLOCK_TYPES: ReadonlySet<string> = new Set([
  'featured-article',
  'featured-article-carousel',
  'featured-articles',
  'article-grid',
  'questurian-maps',
  'where-to-eat-drink',
  'things-to-do-listicles',
  'article-list',
])
