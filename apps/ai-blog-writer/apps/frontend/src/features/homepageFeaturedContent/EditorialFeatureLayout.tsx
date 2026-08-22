import type { SlotValue } from './useHomepageFeaturedSlots'
import type { HomepageFeaturedInvalidItem } from './types'
import type { EditorialFeatureBlockResponse } from './pageBlocks'
import {
  CuratedSlotSwapProvider,
  CuratedSlotSwapWrap
} from './CuratedArticleSlotSwap'

type Props = {
  block: EditorialFeatureBlockResponse
  slots: SlotValue[]
  invalidItemsBySlot: Map<number, HomepageFeaturedInvalidItem>
  onSlotClick: (index: number) => void
  onReorder: (slots: SlotValue[]) => void
}

function categoryLabel(item: NonNullable<SlotValue>): string {
  return item.category?.name ?? item.collectionLabel ?? 'Article'
}

export default function EditorialFeatureLayout({
  block,
  slots,
  invalidItemsBySlot,
  onSlotClick,
  onReorder
}: Props) {
  const count = slots.length
  const featureImage =
    block.featureImagePortrait?.url ?? block.featureImageWide?.url ?? null

  return (
    <div className="hf-editorial-feature-preview">
      <div className="hf-editorial-feature-panel-image">
        {featureImage ? (
          <img src={featureImage} alt="" />
        ) : (
          <span>Choose feature image</span>
        )}
      </div>
      <div className="hf-editorial-feature-panel-copy">
        <p>{block.featureKicker || 'Feature kicker'}</p>
        <h3>{block.featureTitle || 'Feature title'}</h3>
        <div>{block.featureDescription || 'Feature description'}</div>
      </div>
      <CuratedSlotSwapProvider slots={slots} onReorder={onReorder}>
        <div className={`hf-editorial-feature-rail is-${count}`}>
          {slots.map((item, index) => {
            const invalid = invalidItemsBySlot.get(index + 1)
            const image =
              count === 6
                ? null
                : count === 4
                  ? (item?.imageWide?.url ??
                    item?.imageUrl ??
                    item?.imageUrlSquare)
                  : (item?.imageUrlSquare ?? item?.imageUrl)
            return (
              <CuratedSlotSwapWrap key={`editorial-${index}`} slotIndex={index}>
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
