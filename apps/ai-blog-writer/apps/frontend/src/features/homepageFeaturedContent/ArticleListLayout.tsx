import {
  CuratedSlotSwapProvider,
  CuratedSlotSwapWrap
} from './CuratedArticleSlotSwap'
import type { HomepageFeaturedInvalidItem } from './types'
import type { SlotValue } from './useHomepageFeaturedSlots'

type Props = {
  slots: SlotValue[]
  invalidItemsBySlot: Map<number, HomepageFeaturedInvalidItem>
  onSlotClick: (slotIndex: number) => void
  onReorder: (slots: SlotValue[]) => void
}

function ArticleListImagePlaceholder() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

function invalidMessage(item: HomepageFeaturedInvalidItem): string {
  if (item.reason === 'not_published') return 'No longer published'
  if (item.reason === 'not_found') return 'Item not found'
  return 'Invalid reference'
}

export default function ArticleListLayout({
  slots,
  invalidItemsBySlot,
  onSlotClick,
  onReorder
}: Props) {
  return (
    <CuratedSlotSwapProvider slots={slots} onReorder={onReorder}>
      <div
        className="hf-article-list-editor"
        role="list"
        aria-label="Article list slots — scroll to view all"
        tabIndex={0}
      >
        {slots.map((item, slotIndex) => {
          const invalidItem = invalidItemsBySlot.get(slotIndex + 1)
          const row = (
            <button
              type="button"
              className={`hf-article-list-row hf-curated-slot-replace${!item ? ' hf-article-list-row--empty' : ''}${invalidItem ? ' hf-article-list-row--invalid' : ''}`}
              onClick={() => onSlotClick(slotIndex)}
            >
              <span className="hf-article-list-index">
                {String(slotIndex + 1).padStart(2, '0')}
              </span>
              <span className="hf-article-list-thumb">
                {item?.imageUrl ? (
                  <img src={item.imageUrl} alt="" loading="lazy" />
                ) : (
                  <ArticleListImagePlaceholder />
                )}
              </span>
              <span className="hf-article-list-copy">
                <span className="hf-article-list-meta">
                  {invalidItem
                    ? invalidMessage(invalidItem)
                    : item
                      ? `${item.collectionLabel} · ${item.status ?? 'unknown'}`
                      : 'Empty slot'}
                </span>
                <strong>
                  {item?.title ??
                    (invalidItem ? 'Replace unavailable article' : 'Add article')}
                </strong>
                <span className="hf-article-list-summary">
                  {item?.excerpt?.trim() ||
                    item?.authorLabel?.trim() ||
                    (invalidItem
                      ? 'Choose another article to repair this row.'
                      : 'Choose an article for this list position.')}
                </span>
              </span>
              <span className="hf-article-list-action" aria-hidden="true">
                {item ? 'Edit' : 'Add'}
              </span>
            </button>
          )

          return (
            <div
              className="hf-article-list-item"
              role="listitem"
              key={`article-list-slot-${slotIndex + 1}`}
            >
              {item ? (
                <CuratedSlotSwapWrap slotIndex={slotIndex}>
                  {row}
                </CuratedSlotSwapWrap>
              ) : (
                row
              )}
            </div>
          )
        })}
      </div>
    </CuratedSlotSwapProvider>
  )
}
