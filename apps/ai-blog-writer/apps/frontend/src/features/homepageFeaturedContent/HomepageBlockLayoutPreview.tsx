import type { CuratedHomepageBlockType } from './pageBlocks'

type PreviewKind =
  | 'article-grid'
  | 'article-list'
  | 'carousel'
  | 'creator-hero'
  | 'editorial'
  | 'hero'
  | 'map-grid'
  | 'newsletter'
  | 'place-grid'
  | 'story-grid'

const PREVIEW_KIND_BY_BLOCK_TYPE: Record<
  CuratedHomepageBlockType,
  PreviewKind
> = {
  'featured-article': 'hero',
  'featured-creator-article': 'creator-hero',
  'featured-article-carousel': 'carousel',
  'featured-articles': 'editorial',
  'editorial-feature': 'story-grid',
  'article-grid': 'article-grid',
  'location-grid': 'place-grid',
  'questurian-maps': 'map-grid',
  'hotel-grid': 'place-grid',
  'tour-grid': 'place-grid',
  'where-to-eat-drink': 'article-grid',
  'things-to-do-listicles': 'article-grid',
  'things-to-do-attractions': 'place-grid',
  'newsletter-signup': 'newsletter',
  'article-list': 'article-list'
}

function PreviewPieces({ kind }: { kind: PreviewKind }) {
  switch (kind) {
    case 'hero':
      return <span className="hf-layout-piece hf-layout-piece--hero" />
    case 'creator-hero':
      return (
        <span className="hf-layout-piece hf-layout-piece--hero">
          <span className="hf-layout-avatar" />
        </span>
      )
    case 'carousel':
      return (
        <>
          <span className="hf-layout-arrow">‹</span>
          <span className="hf-layout-piece hf-layout-piece--hero" />
          <span className="hf-layout-arrow">›</span>
        </>
      )
    case 'editorial':
      return (
        <>
          <span className="hf-layout-piece hf-layout-piece--lead" />
          <span className="hf-layout-piece hf-layout-piece--side-top" />
          <span className="hf-layout-piece hf-layout-piece--side-bottom" />
        </>
      )
    case 'story-grid':
      return (
        <>
          <span className="hf-layout-piece hf-layout-piece--feature-copy" />
          <span className="hf-layout-piece hf-layout-piece--story" />
          <span className="hf-layout-piece hf-layout-piece--story" />
          <span className="hf-layout-piece hf-layout-piece--story" />
        </>
      )
    case 'article-grid':
    case 'place-grid':
      return Array.from({ length: 6 }, (_, index) => (
        <span className="hf-layout-piece hf-layout-piece--tile" key={index} />
      ))
    case 'map-grid':
      return Array.from({ length: 6 }, (_, index) => (
        <span className="hf-layout-piece hf-layout-piece--map" key={index}>
          <span className="hf-layout-map-pin" />
        </span>
      ))
    case 'article-list':
      return Array.from({ length: 4 }, (_, index) => (
        <span className="hf-layout-piece hf-layout-piece--list-row" key={index}>
          <span className="hf-layout-list-image" />
          <span className="hf-layout-list-lines" />
        </span>
      ))
    case 'newsletter':
      return (
        <span className="hf-layout-piece hf-layout-piece--newsletter">
          <span className="hf-layout-newsletter-copy" />
          <span className="hf-layout-newsletter-field" />
        </span>
      )
  }
}

export default function HomepageBlockLayoutPreview({
  blockType
}: {
  blockType: CuratedHomepageBlockType
}) {
  const kind = PREVIEW_KIND_BY_BLOCK_TYPE[blockType]

  return (
    <span
      className={`hf-block-layout-preview hf-block-layout-preview--${kind}`}
      aria-hidden="true"
      data-testid={`block-layout-preview-${blockType}`}
    >
      <span className="hf-layout-browser-bar" />
      <span className="hf-layout-canvas">
        <PreviewPieces kind={kind} />
      </span>
    </span>
  )
}
