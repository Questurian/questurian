import { useEffect, useMemo, useState } from 'react'

import {
  HOMEPAGE_PAGE_BLOCK_CONFIG,
  HOMEPAGE_PAGE_BLOCK_TYPES,
  type CuratedHomepageBlockType,
} from './pageBlocks'

type AddBlockStep = 'type' | 'options'

const SECTION_HEADING_MAX_LEN = 120

function blockTypeSupportsSectionHeading(blockType: CuratedHomepageBlockType): boolean {
  return blockType === 'featured-articles' || blockType === 'location-grid'
}

type Props = {
  isPending: boolean
  onConfirm: (
    blockType: CuratedHomepageBlockType,
    slotCount: number,
    sectionHeading?: string | null,
  ) => void
  onCancel: () => void
  availableBlockTypes?: CuratedHomepageBlockType[]
}

export default function AddHomepageBlockPicker({
  isPending,
  onConfirm,
  onCancel,
  availableBlockTypes = HOMEPAGE_PAGE_BLOCK_TYPES,
}: Props) {
  const initialBlockType = availableBlockTypes[0] ?? HOMEPAGE_PAGE_BLOCK_TYPES[0]
  const [step, setStep] = useState<AddBlockStep>('type')
  const [selectedBlockType, setSelectedBlockType] = useState<CuratedHomepageBlockType>(initialBlockType)
  const [selectedSlotCount, setSelectedSlotCount] = useState(
    HOMEPAGE_PAGE_BLOCK_CONFIG[initialBlockType].defaultSlotCount,
  )
  const [customSlotCount, setCustomSlotCount] = useState('')
  const [sectionHeadingDraft, setSectionHeadingDraft] = useState('')

  useEffect(() => {
    if (availableBlockTypes.includes(selectedBlockType)) return

    const nextBlockType = availableBlockTypes[0] ?? HOMEPAGE_PAGE_BLOCK_TYPES[0]
    setSelectedBlockType(nextBlockType)
    setSelectedSlotCount(HOMEPAGE_PAGE_BLOCK_CONFIG[nextBlockType].defaultSlotCount)
    setCustomSlotCount('')
    setSectionHeadingDraft('')
    setStep('type')
  }, [availableBlockTypes, selectedBlockType])

  const blockConfig = HOMEPAGE_PAGE_BLOCK_CONFIG[selectedBlockType]
  const resolvedSlotCount = useMemo(() => {
    if (!customSlotCount.trim()) return selectedSlotCount

    return Number(customSlotCount)
  }, [customSlotCount, selectedSlotCount])
  const isSlotCountValid =
    Number.isInteger(resolvedSlotCount) &&
    resolvedSlotCount >= blockConfig.minSlotCount &&
    resolvedSlotCount <= blockConfig.maxSlotCount

  function handleSelectBlockType(blockType: CuratedHomepageBlockType) {
    const nextConfig = HOMEPAGE_PAGE_BLOCK_CONFIG[blockType]
    if (nextConfig.minSlotCount === nextConfig.maxSlotCount) {
      onConfirm(
        blockType,
        nextConfig.defaultSlotCount,
        blockTypeSupportsSectionHeading(blockType) ? sectionHeadingDraft.trim() || undefined : undefined,
      )
      return
    }
    setSelectedBlockType(blockType)
    setSelectedSlotCount(nextConfig.defaultSlotCount)
    setCustomSlotCount('')
    setSectionHeadingDraft('')
    setStep('options')
  }

  function handleBack() {
    setStep('type')
    setSelectedSlotCount(HOMEPAGE_PAGE_BLOCK_CONFIG[selectedBlockType].defaultSlotCount)
    setCustomSlotCount('')
    setSectionHeadingDraft('')
  }

  function handleConfirm() {
    if (!isSlotCountValid) return

    onConfirm(
      selectedBlockType,
      resolvedSlotCount,
      blockTypeSupportsSectionHeading(selectedBlockType) ? sectionHeadingDraft.trim() || undefined : undefined,
    )
  }

  if (step === 'type') {
    return (
      <div className="hf-add-block-picker">
        <p className="hf-add-block-prompt">Choose a block type:</p>
        {availableBlockTypes.map((blockType) => {
          const config = HOMEPAGE_PAGE_BLOCK_CONFIG[blockType]

          return (
            <button
              key={blockType}
              type="button"
              className="hf-block-type-option"
              onClick={() => handleSelectBlockType(blockType)}
            >
              <strong>{config.label}</strong>
              <span>{config.description}</span>
            </button>
          )
        })}
        <button type="button" className="hf-btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="hf-add-block-picker">
      <p className="hf-add-block-prompt">
        {blockConfig.label} size
      </p>
      <p className="hf-add-block-hint">
        Choose between {blockConfig.minSlotCount} and {blockConfig.maxSlotCount} items.
      </p>
      <div className="hf-add-block-counts">
        {blockConfig.quickSlotCounts.map((count) => (
          <button
            key={count}
            type="button"
            className={`hf-btn-ghost${selectedSlotCount === count && !customSlotCount.trim() ? ' active' : ''}`}
            onClick={() => {
              setSelectedSlotCount(count)
              setCustomSlotCount('')
            }}
          >
            {count}
          </button>
        ))}
        <input
          type="number"
          className="hf-slot-count-input"
          min={blockConfig.minSlotCount}
          max={blockConfig.maxSlotCount}
          placeholder="Custom…"
          value={customSlotCount}
          onChange={(event) => setCustomSlotCount(event.target.value)}
        />
      </div>
      {blockTypeSupportsSectionHeading(selectedBlockType) ? (
        <label className="hf-add-block-section-heading">
          <span className="hf-add-block-section-heading-label">Section heading (optional)</span>
          <input
            type="text"
            className="hf-add-block-section-heading-input"
            maxLength={SECTION_HEADING_MAX_LEN}
            placeholder="Shown above this block on the site"
            value={sectionHeadingDraft}
            onChange={(event) => setSectionHeadingDraft(event.target.value)}
            autoComplete="off"
          />
        </label>
      ) : null}
      <div className="hf-add-block-actions">
        <button
          type="button"
          className="hf-btn-ghost"
          onClick={handleBack}
        >
          ← Back
        </button>
        <button
          type="button"
          className="hf-btn-primary"
          onClick={handleConfirm}
          disabled={isPending || !isSlotCountValid}
        >
          {isPending ? 'Adding…' : 'Add Block'}
        </button>
      </div>
    </div>
  )
}
