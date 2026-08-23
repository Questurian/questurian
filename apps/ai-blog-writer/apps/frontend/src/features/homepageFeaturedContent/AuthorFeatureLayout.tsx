import type { SlotValue } from './useHomepageFeaturedSlots'
import type { HomepageFeaturedInvalidItem } from './types'
import type { AuthorFeatureBlockResponse } from './pageBlocks'
import {
  CuratedSlotSwapProvider,
  CuratedSlotSwapWrap
} from './CuratedArticleSlotSwap'

type Props = {
  block: AuthorFeatureBlockResponse
  slots: SlotValue[]
  invalidItemsBySlot: Map<number, HomepageFeaturedInvalidItem>
  onSlotClick: (index: number) => void
  onReorder: (slots: SlotValue[]) => void
}

function categoryLabel(item: NonNullable<SlotValue>): string {
  return item.category?.name ?? item.collectionLabel ?? 'Article'
}

export default function AuthorFeatureLayout({
  block,
  slots,
  invalidItemsBySlot,
  onSlotClick,
  onReorder
}: Props) {
  const count = slots.length
  const author = block.authorCard
  const shaped = block.imageStyle === 'circle' || block.imageStyle === 'square'
  const featureImage = shaped
    ? (author?.imageSquare?.url ?? author?.image?.url ?? null)
    : (author?.image?.url ?? author?.imageWide?.url ?? null)

  return (
    <div
      className={`hf-editorial-feature-preview hf-author-feature-preview is-${block.imageStyle}`}
    >
      <div className="hf-editorial-feature-panel-image hf-author-feature-panel-image">
        {featureImage ? (
          <img src={featureImage} alt="" />
        ) : (
          <span>Choose Author image</span>
        )}
      </div>
      <div className="hf-editorial-feature-panel-copy hf-author-feature-panel-copy">
        <p>{block.sectionHeading || 'Author spotlight'}</p>
        <h3>{author?.author.name || 'Choose an Author'}</h3>
        {author?.spotlightNote ? <small>{author.spotlightNote}</small> : null}
        <div>{author?.author.bio || 'Author bio appears here.'}</div>
        {author?.author.expertise.length ? (
          <b>{author.author.expertise.slice(0, 3).join(' / ')}</b>
        ) : null}
      </div>
      <CuratedSlotSwapProvider slots={slots} onReorder={onReorder}>
        <div className={`hf-editorial-feature-rail is-${count}`}>
          {slots.map((item, index) => {
            const invalid = invalidItemsBySlot.get(index + 1)
            const image =
              count === 6
                ? null
                : count === 4 || count === 1
                  ? (item?.imageWide?.url ??
                    item?.imageUrl ??
                    item?.imageUrlSquare)
                  : (item?.imageUrlSquare ?? item?.imageUrl)
            return (
              <CuratedSlotSwapWrap key={`author-${index}`} slotIndex={index}>
                <button
                  type="button"
                  className={`hf-editorial-feature-slot${invalid ? ' invalid' : ''}`}
                  onClick={() => onSlotClick(index)}
                >
                  {image ? (
                    <img src={image} alt="" />
                  ) : count === 6 ? (
                    <b>{String(index + 1).padStart(2, '0')}</b>
                  ) : null}
                  <span>
                    <small>
                      {item
                        ? categoryLabel(item)
                        : invalid
                          ? 'Invalid article'
                          : 'Empty slot'}
                    </small>
                    <strong>{item?.title ?? 'Choose article'}</strong>
                  </span>
                </button>
              </CuratedSlotSwapWrap>
            )
          })}
        </div>
      </CuratedSlotSwapProvider>
    </div>
  )
}
