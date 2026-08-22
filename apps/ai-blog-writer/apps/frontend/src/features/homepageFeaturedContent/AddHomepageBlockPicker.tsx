import { useEffect, useMemo, useState } from 'react'

import {
  HOMEPAGE_PAGE_BLOCK_CONFIG,
  HOMEPAGE_PAGE_BLOCK_TYPES,
  isValidHomepageBlockSlotCount,
  type CuratedHomepageBlockType
} from './pageBlocks'
import HomepageBlockLayoutPreview from './HomepageBlockLayoutPreview'

type AddBlockStep = 'type' | 'options'
type BlockPickerGroupId =
  | 'lead-stories'
  | 'hero-features'
  | 'story-collections'
  | 'places-experiences'
  | 'reader-signup'
  | 'page-ending'

const BLOCK_PICKER_GROUPS: ReadonlyArray<{
  id: BlockPickerGroupId
  label: string
  description: string
}> = [
  {
    id: 'lead-stories',
    label: 'Lead stories',
    description:
      'Large layouts built around a primary story or editorial package.'
  },
  {
    id: 'hero-features',
    label: 'Hero features',
    description:
      'Full-width banners for one story, creator, or rotating feature.'
  },
  {
    id: 'story-collections',
    label: 'Story collections',
    description: 'Repeatable grids for groups of guides and articles.'
  },
  {
    id: 'places-experiences',
    label: 'Places & experiences',
    description: 'Card grids for destinations, stays, tours, and attractions.'
  },
  {
    id: 'reader-signup',
    label: 'Reader signup',
    description: 'Sections that invite readers to stay connected.'
  },
  {
    id: 'page-ending',
    label: 'Page ending',
    description: 'A long article feed designed to finish every homepage.'
  }
]

/** Exhaustive so each future block type must choose a clear picker group. */
const BLOCK_PICKER_GROUP_BY_TYPE: Record<
  CuratedHomepageBlockType,
  BlockPickerGroupId
> = {
  'featured-article': 'hero-features',
  'featured-creator-article': 'hero-features',
  'featured-article-carousel': 'hero-features',
  'featured-articles': 'lead-stories',
  'editorial-feature': 'lead-stories',
  'article-grid': 'story-collections',
  'article-list': 'page-ending',
  'where-to-eat-drink': 'story-collections',
  'things-to-do-listicles': 'story-collections',
  'questurian-maps': 'story-collections',
  'location-grid': 'places-experiences',
  'hotel-grid': 'places-experiences',
  'tour-grid': 'places-experiences',
  'things-to-do-attractions': 'places-experiences',
  'newsletter-signup': 'reader-signup'
}

const SECTION_HEADING_MAX_LEN = 120
const SECTION_SUBHEADING_MAX_LEN = 200

type Props = {
  isPending: boolean
  onConfirm: (
    blockType: CuratedHomepageBlockType,
    slotCount: number,
    sectionHeading?: string | null,
    sectionSubheading?: string | null
  ) => void
  onCancel: () => void
  availableBlockTypes?: CuratedHomepageBlockType[]
}

export default function AddHomepageBlockPicker({
  isPending,
  onConfirm,
  onCancel,
  availableBlockTypes = HOMEPAGE_PAGE_BLOCK_TYPES
}: Props) {
  const initialBlockType =
    availableBlockTypes[0] ?? HOMEPAGE_PAGE_BLOCK_TYPES[0]
  const [step, setStep] = useState<AddBlockStep>('type')
  const [selectedBlockType, setSelectedBlockType] =
    useState<CuratedHomepageBlockType>(initialBlockType)
  const [selectedSlotCount, setSelectedSlotCount] = useState(
    HOMEPAGE_PAGE_BLOCK_CONFIG[initialBlockType].defaultSlotCount
  )
  const [customSlotCount, setCustomSlotCount] = useState('')
  const [sectionHeadingDraft, setSectionHeadingDraft] = useState('')
  const [sectionSubheadingDraft, setSectionSubheadingDraft] = useState('')

  useEffect(() => {
    if (availableBlockTypes.includes(selectedBlockType)) return

    const nextBlockType = availableBlockTypes[0] ?? HOMEPAGE_PAGE_BLOCK_TYPES[0]
    setSelectedBlockType(nextBlockType)
    setSelectedSlotCount(
      HOMEPAGE_PAGE_BLOCK_CONFIG[nextBlockType].defaultSlotCount
    )
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
  const isSlotCountValid = isValidHomepageBlockSlotCount(
    selectedBlockType,
    resolvedSlotCount
  )
  const availableGroups = useMemo(
    () =>
      BLOCK_PICKER_GROUPS.map((group) => ({
        ...group,
        blockTypes: availableBlockTypes.filter(
          (blockType) => BLOCK_PICKER_GROUP_BY_TYPE[blockType] === group.id
        )
      })).filter((group) => group.blockTypes.length > 0),
    [availableBlockTypes]
  )

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
    setSelectedSlotCount(
      HOMEPAGE_PAGE_BLOCK_CONFIG[selectedBlockType].defaultSlotCount
    )
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
      s || undefined
    )
  }

  if (step === 'type') {
    return (
      <div className="hf-add-block-picker hf-add-block-picker--layouts">
        <div className="hf-add-block-picker-heading">
          <p className="hf-add-block-prompt">Add a homepage section</p>
          <p className="hf-add-block-hint">
            Choose the layout that best fits this content. Set its size next
            when available.
          </p>
        </div>
        <div className="hf-block-type-groups">
          {availableGroups.map((group) => (
            <section
              className="hf-block-type-group"
              aria-labelledby={`hf-block-group-${group.id}`}
              key={group.id}
            >
              <div className="hf-block-type-group-heading">
                <h3 id={`hf-block-group-${group.id}`}>{group.label}</h3>
                <p>{group.description}</p>
              </div>
              <div className="hf-block-type-options">
                {group.blockTypes.map((blockType) => {
                  const config = HOMEPAGE_PAGE_BLOCK_CONFIG[blockType]

                  return (
                    <button
                      key={blockType}
                      type="button"
                      className="hf-block-type-option"
                      onClick={() => handleSelectBlockType(blockType)}
                    >
                      <HomepageBlockLayoutPreview blockType={blockType} />
                      <span className="hf-block-type-option-copy">
                        <strong>{config.label}</strong>
                        <span>{config.description}</span>
                      </span>
                      <span
                        className="hf-block-type-option-arrow"
                        aria-hidden="true"
                      >
                        →
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
        <div className="hf-add-block-picker-footer">
          <button type="button" className="hf-btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="hf-add-block-picker">
      <p className="hf-add-block-prompt">{blockConfig.label} size</p>
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
        <span className="hf-add-block-section-heading-label">
          Section heading (optional)
        </span>
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
        <span className="hf-add-block-section-heading-label">
          Subheading (optional)
        </span>
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
        <button type="button" className="hf-btn-ghost" onClick={handleBack}>
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
