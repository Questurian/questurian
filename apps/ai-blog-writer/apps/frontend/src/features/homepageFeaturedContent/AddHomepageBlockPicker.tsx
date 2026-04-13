import { useEffect, useMemo, useState } from 'react'

import {
  HOMEPAGE_PAGE_BLOCK_CONFIG,
  HOMEPAGE_PAGE_BLOCK_TYPES,
  isValidHomepageBlockSlotCount,
  type CuratedHomepageBlockType,
} from './pageBlocks'

type AddBlockStep = 'type' | 'options'

const SECTION_HEADING_MAX_LEN = 120
const SECTION_SUBHEADING_MAX_LEN = 200

type Props = {
  isPending: boolean
  onConfirm: (
    blockType: CuratedHomepageBlockType,
    slotCount: number,
    sectionHeading?: string | null,
    sectionSubheading?: string | null,
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
  const [sectionSubheadingDraft, setSectionSubheadingDraft] = useState('')

  useEffect(() => {
    if (availableBlockTypes.includes(selectedBlockType)) return

    const nextBlockType = availableBlockTypes[0] ?? HOMEPAGE_PAGE_BLOCK_TYPES[0]
    setSelectedBlockType(nextBlockType)
    setSelectedSlotCount(HOMEPAGE_PAGE_BLOCK_CONFIG[nextBlockType].defaultSlotCount)
    setCustomSlotCount('')
    setSectionHeadingDraft('')
    setSectionSubheadingDraft('')
    setStep('type')
  }, [availableBlockTypes, selectedBlockType])

  const blockConfig = HOMEPAGE_PAGE_BLOCK_CONFIG[selectedBlockType]
  const resolvedSlotCount = useMemo(() => {
    if (!customSlotCount.trim()) return selectedSlotCount

    return Number(customSlotCount)
  }, [customSlotCount, selectedSlotCount])
  const isSlotCountValid = isValidHomepageBlockSlotCount(selectedBlockType, resolvedSlotCount)

  function handleSelectBlockType(blockType: CuratedHomepageBlockType) {
    const nextConfig = HOMEPAGE_PAGE_BLOCK_CONFIG[blockType]
    if (nextConfig.minSlotCount === nextConfig.maxSlotCount) {
      onConfirm(blockType, nextConfig.defaultSlotCount, undefined, undefined)
      return
    }
    setSelectedBlockType(blockType)
    setSelectedSlotCount(nextConfig.defaultSlotCount)
    setCustomSlotCount('')
    setSectionHeadingDraft('')
    setSectionSubheadingDraft('')
    setStep('options')
  }

  function handleBack() {
    setStep('type')
    setSelectedSlotCount(HOMEPAGE_PAGE_BLOCK_CONFIG[selectedBlockType].defaultSlotCount)
    setCustomSlotCount('')
    setSectionHeadingDraft('')
    setSectionSubheadingDraft('')
  }

  function handleConfirm() {
    if (!isSlotCountValid) return

    const h = sectionHeadingDraft.trim()
    const s = sectionSubheadingDraft.trim()
    onConfirm(
      selectedBlockType,
      resolvedSlotCount,
      h || undefined,
      s || undefined,
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
        {selectedBlockType === 'article-grid'
          ? 'Choose 4 (square grid: four across on large screens, 2×2 on narrow) or 8 (four columns × two rows, all square).'
          : `Choose between ${blockConfig.minSlotCount} and ${blockConfig.maxSlotCount} items.`}
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
      <label className="hf-add-block-section-heading">
        <span className="hf-add-block-section-heading-label">Subheading (optional)</span>
        <textarea
          className="hf-add-block-section-subheading-input"
          maxLength={SECTION_SUBHEADING_MAX_LEN}
          rows={2}
          placeholder="Supporting line under the title"
          value={sectionSubheadingDraft}
          onChange={(event) => setSectionSubheadingDraft(event.target.value)}
          autoComplete="off"
        />
      </label>
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
