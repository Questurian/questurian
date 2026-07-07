import { useEffect, useMemo, useState } from 'react'

import {
  HOMEPAGE_PAGE_BLOCK_CONFIG,
  isValidHomepageBlockSlotCount,
  type CuratedHomepageBlockType
} from './pageBlocks'

type Props = {
  blockId: string
  blockType: CuratedHomepageBlockType
  currentSlotCount: number
  savedSlotCount: number
  slots: unknown[]
  invalidSlots?: number[]
  disabled?: boolean
  isPending?: boolean
  onResize: (slotCount: number) => void
}

export default function HomepageBlockSlotCountSection({
  blockId,
  blockType,
  currentSlotCount,
  savedSlotCount,
  slots,
  invalidSlots = [],
  disabled = false,
  isPending = false,
  onResize
}: Props) {
  const config = HOMEPAGE_PAGE_BLOCK_CONFIG[blockType]
  const [draftCount, setDraftCount] = useState(currentSlotCount)

  useEffect(() => {
    setDraftCount(currentSlotCount)
  }, [blockId, currentSlotCount])

  const fixedSlotCount = config.minSlotCount === config.maxSlotCount
  const chosenCount = Math.trunc(draftCount)
  const validChoice = isValidHomepageBlockSlotCount(blockType, chosenCount)
  const isNoOp = chosenCount === currentSlotCount
  const removedFilledCount = useMemo(
    () =>
      chosenCount < currentSlotCount
        ? slots.slice(chosenCount).filter(Boolean).length
        : 0,
    [chosenCount, currentSlotCount, slots]
  )
  const removedInvalidCount = useMemo(
    () =>
      chosenCount < currentSlotCount
        ? invalidSlots.filter((slot) => slot > chosenCount).length
        : 0,
    [chosenCount, currentSlotCount, invalidSlots]
  )
  const removedItemCount = removedFilledCount + removedInvalidCount

  if (fixedSlotCount) return null

  function handleApply() {
    if (disabled || isPending || isNoOp || !validChoice) return

    if (chosenCount < currentSlotCount && removedItemCount > 0) {
      const confirmed = window.confirm(
        `Shrink this block to ${chosenCount} slots? ${removedItemCount} filled slot${
          removedItemCount === 1 ? '' : 's'
        } at the end will be removed from this draft.`
      )
      if (!confirmed) return
    }

    onResize(chosenCount)
  }

  const delta = chosenCount - currentSlotCount

  return (
    <section className="hf-block-settings-section">
      <h3 className="hf-block-settings-kicker">Grid size</h3>
      <p className="hf-block-settings-hint">
        Change slot count without rebuilding the block. Growing keeps current picks and adds empty
        slots at the end; shrinking removes end slots.
      </p>
      <div className="hf-block-convert-row">
        <span className="hf-block-convert-label">Slots</span>
        <div className="hf-block-convert-counts">
          {config.quickSlotCounts.map((count) => (
            <button
              key={count}
              type="button"
              className={`hf-btn-ghost${draftCount === count ? ' active' : ''}`}
              disabled={disabled || isPending}
              onClick={() => setDraftCount(count)}
            >
              {count}
            </button>
          ))}
        </div>
        <input
          type="number"
          className="hf-slot-count-input hf-block-convert-custom"
          min={config.minSlotCount}
          max={config.maxSlotCount}
          aria-label="Slot count"
          value={draftCount}
          disabled={disabled || isPending}
          onChange={(event) => setDraftCount(Number(event.target.value))}
        />
        <button
          type="button"
          className="hf-btn-primary"
          disabled={disabled || isPending || isNoOp || !validChoice}
          onClick={handleApply}
        >
          Apply size
        </button>
      </div>
      {!validChoice ? (
        <p className="hf-block-section-heading-error">
          Choose a supported slot count for {config.label.toLowerCase()}.
        </p>
      ) : delta > 0 ? (
        <p className="hf-block-settings-hint">
          Applies locally: adds {delta} empty slot{delta === 1 ? '' : 's'}. Fill them, then save.
        </p>
      ) : delta < 0 ? (
        <p className="hf-block-settings-hint">
          Applies locally: removes {Math.abs(delta)} end slot{Math.abs(delta) === 1 ? '' : 's'}
          {removedItemCount > 0
            ? `, including ${removedItemCount} filled slot${removedItemCount === 1 ? '' : 's'}`
            : ''}
          . Save to persist.
        </p>
      ) : savedSlotCount !== currentSlotCount ? (
        <p className="hf-block-settings-hint">
          Draft size is {currentSlotCount}; saved size is {savedSlotCount}. Save to persist.
        </p>
      ) : null}
    </section>
  )
}
