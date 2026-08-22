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

function SpecimenCard({
  kind
}: {
  kind: 'compact' | 'hero' | 'horizontal' | 'stacked' | 'text' | 'wide'
}) {
  return (
    <span
      className={`hf-featured-specimen-card hf-featured-specimen-card--${kind}`}
      data-featured-slot
    >
      {kind !== 'text' && <span className="hf-featured-specimen-image" />}
      <span className="hf-featured-specimen-copy">
        <span />
        <span />
        <span />
      </span>
    </span>
  )
}

function FeaturedArticlesSpecimen({ slotCount }: { slotCount?: number }) {
  const count = slotCount ?? 3

  if (count === 3) {
    return (
      <span
        className="hf-featured-specimen hf-featured-specimen--3"
        data-featured-layout="hero-left"
      >
        <SpecimenCard kind="hero" />
        <span className="hf-featured-specimen-stack">
          <SpecimenCard kind="stacked" />
          <SpecimenCard kind="stacked" />
        </span>
      </span>
    )
  }

  if (count === 4) {
    return (
      <span className="hf-featured-specimen hf-featured-specimen--4">
        <SpecimenCard kind="hero" />
        <span className="hf-featured-specimen-stack">
          {Array.from({ length: 3 }, (_, index) => (
            <SpecimenCard kind="horizontal" key={index} />
          ))}
        </span>
      </span>
    )
  }

  if (count === 5) {
    return (
      <span className="hf-featured-specimen hf-featured-specimen--5">
        <SpecimenCard kind="hero" />
        <span className="hf-featured-specimen-stack">
          <SpecimenCard kind="stacked" />
          {Array.from({ length: 3 }, (_, index) => (
            <SpecimenCard kind="text" key={index} />
          ))}
        </span>
      </span>
    )
  }

  if (count === 7 || count === 8) {
    return (
      <span className={`hf-featured-specimen hf-featured-specimen--${count}`}>
        <span className="hf-featured-specimen-left">
          <SpecimenCard kind="wide" />
          <SpecimenCard kind="wide" />
        </span>
        <SpecimenCard kind="hero" />
        <span className="hf-featured-specimen-right">
          <span className="hf-featured-specimen-recommended" />
          {Array.from({ length: count - 3 }, (_, index) => (
            <SpecimenCard kind="compact" key={index} />
          ))}
        </span>
      </span>
    )
  }

  return (
    <span className="hf-featured-specimen hf-featured-specimen--9">
      <span className="hf-featured-specimen-left">
        <SpecimenCard kind="wide" />
        <SpecimenCard kind="wide" />
      </span>
      <span className="hf-featured-specimen-center">
        <SpecimenCard kind="hero" />
        <SpecimenCard kind="horizontal" />
      </span>
      <span className="hf-featured-specimen-right">
        {Array.from({ length: 5 }, (_, index) => (
          <SpecimenCard kind="compact" key={index} />
        ))}
      </span>
    </span>
  )
}

function EditorialFeatureRelatedStory({ numbered }: { numbered: boolean }) {
  return (
    <span
      className={`hf-editorial-specimen-related${numbered ? ' is-numbered' : ''}`}
      data-editorial-related
    >
      {numbered ? (
        <span className="hf-editorial-specimen-number" data-editorial-number />
      ) : (
        <span
          className="hf-editorial-specimen-thumbnail"
          data-editorial-thumbnail
        />
      )}
      <span className="hf-editorial-specimen-related-copy">
        <span />
        <span />
      </span>
    </span>
  )
}

function EditorialFeatureSpecimen({ slotCount }: { slotCount?: number }) {
  const count = slotCount ?? 3
  const numbered = count === 6

  return (
    <span
      className={`hf-editorial-specimen hf-editorial-specimen--${count}`}
      data-editorial-layout={count}
    >
      <span className="hf-editorial-specimen-feature-image" />
      <span className="hf-editorial-specimen-feature-copy">
        <span className="hf-editorial-specimen-kicker" />
        <span className="hf-editorial-specimen-title" />
        <span className="hf-editorial-specimen-title is-short" />
        <span className="hf-editorial-specimen-description" />
        <span className="hf-editorial-specimen-description is-short" />
      </span>
      <span className="hf-editorial-specimen-rail">
        {Array.from({ length: count }, (_, index) => (
          <EditorialFeatureRelatedStory numbered={numbered} key={index} />
        ))}
      </span>
    </span>
  )
}

function PreviewPieces({
  kind,
  slotCount
}: {
  kind: PreviewKind
  slotCount?: number
}) {
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
          {slotCount != null && (
            <span className="hf-layout-carousel-count">{slotCount} slides</span>
          )}
        </>
      )
    case 'editorial':
      return <FeaturedArticlesSpecimen slotCount={slotCount} />
    case 'story-grid':
      return <EditorialFeatureSpecimen slotCount={slotCount} />
    case 'article-grid':
    case 'place-grid':
      return Array.from({ length: Math.min(slotCount ?? 6, 8) }, (_, index) => (
        <span className="hf-layout-piece hf-layout-piece--tile" key={index} />
      ))
    case 'map-grid':
      return Array.from({ length: 6 }, (_, index) => (
        <span className="hf-layout-piece hf-layout-piece--map" key={index}>
          <span className="hf-layout-map-pin" />
        </span>
      ))
    case 'article-list':
      return Array.from({ length: Math.min(slotCount ?? 4, 5) }, (_, index) => (
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
  blockType,
  slotCount
}: {
  blockType: CuratedHomepageBlockType
  slotCount?: number
}) {
  const kind = PREVIEW_KIND_BY_BLOCK_TYPE[blockType]

  return (
    <span
      className={`hf-block-layout-preview hf-block-layout-preview--${kind}`}
      aria-hidden="true"
      data-testid={`block-layout-preview-${blockType}`}
      data-slot-count={slotCount}
    >
      <span className="hf-layout-browser-bar" />
      <span className="hf-layout-canvas">
        <PreviewPieces kind={kind} slotCount={slotCount} />
      </span>
    </span>
  )
}
