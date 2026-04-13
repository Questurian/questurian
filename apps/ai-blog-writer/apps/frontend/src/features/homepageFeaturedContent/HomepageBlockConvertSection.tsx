import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'

import { HOMEPAGE_PAGE_BLOCK_CONFIG, type CuratedHomepageBlockType } from './pageBlocks'

type Props = {
  blockId: string
  /** Block type currently stored for this block (resize + convert). */
  currentBlockType: CuratedHomepageBlockType
  /** Saved slot count for this block (`selection.totalSlots`). */
  currentSlotCount: number
  token: string | null
  /** Allowed types in the dropdown, including {@link currentBlockType} for empty resize. */
  convertTargetOptions: CuratedHomepageBlockType[]
  canConvert: boolean
  onConvert: (
    token: string,
    blockType: CuratedHomepageBlockType,
    slotCount: number,
  ) => Promise<void>
  onConverted?: () => void
}

export default function HomepageBlockConvertSection({
  blockId,
  currentBlockType,
  currentSlotCount,
  token,
  convertTargetOptions,
  canConvert,
  onConvert,
  onConverted,
}: Props) {
  const convertTargets = useMemo(
    () => (convertTargetOptions.length > 0 ? convertTargetOptions : []),
    [convertTargetOptions],
  )

  const [convertTargetType, setConvertTargetType] =
    useState<CuratedHomepageBlockType>(currentBlockType)
  const [convertSlotCount, setConvertSlotCount] = useState(currentSlotCount)

  useEffect(() => {
    setConvertTargetType(currentBlockType)
    setConvertSlotCount(currentSlotCount)
  }, [blockId, currentBlockType, currentSlotCount])

  useEffect(() => {
    if (convertTargets.length === 0) return
    if (!convertTargets.includes(convertTargetType)) {
      const next = convertTargets[0]
      setConvertTargetType(next)
      setConvertSlotCount(
        next === currentBlockType
          ? currentSlotCount
          : HOMEPAGE_PAGE_BLOCK_CONFIG[next].defaultSlotCount,
      )
    }
  }, [convertTargets, convertTargetType, currentBlockType, currentSlotCount])

  useEffect(() => {
    if (!convertTargets.includes(convertTargetType)) return
    if (convertTargetType === currentBlockType) {
      setConvertSlotCount(currentSlotCount)
    } else {
      setConvertSlotCount(HOMEPAGE_PAGE_BLOCK_CONFIG[convertTargetType].defaultSlotCount)
    }
  }, [convertTargetType, convertTargets, currentBlockType, currentSlotCount])

  const convertMutation = useMutation({
    mutationFn: async ({
      blockType,
      slotCount,
    }: {
      blockType: CuratedHomepageBlockType
      slotCount: number
    }) => {
      if (!token) return
      await onConvert(token, blockType, slotCount)
    },
    onSuccess: () => {
      onConverted?.()
    },
  })

  const convertCfg = HOMEPAGE_PAGE_BLOCK_CONFIG[convertTargetType]
  const convertSlotsFixed = convertCfg.minSlotCount === convertCfg.maxSlotCount

  const normalizedChosen = (() => {
    let n = convertSlotCount
    if (convertSlotsFixed) {
      n = convertCfg.defaultSlotCount
    } else {
      n = Math.min(Math.max(Math.trunc(n), convertCfg.minSlotCount), convertCfg.maxSlotCount)
    }
    return n
  })()

  const isNoOp =
    convertTargetType === currentBlockType && normalizedChosen === currentSlotCount

  function handleConvert() {
    if (!canConvert || !token || isNoOp) return
    convertMutation.mutate({ blockType: convertTargetType, slotCount: normalizedChosen })
  }

  if (!canConvert || convertTargets.length === 0) {
    return null
  }

  const actionLabel =
    convertTargetType === currentBlockType
      ? convertMutation.isPending
        ? 'Updating…'
        : 'Update slot count'
      : convertMutation.isPending
        ? 'Converting…'
        : 'Convert block'

  return (
    <section className="hf-block-settings-section">
      <h3 className="hf-block-settings-kicker">Change block type</h3>
      <p className="hf-block-settings-hint">
        Nothing saved in this block yet. Choose a type and slot count, or keep this type and only
        change slots. Your section title is kept when supported.
      </p>
      <div className="hf-block-convert-row">
        <label className="hf-block-convert-label" htmlFor={`hf-convert-type-${blockId}`}>
          Block type
        </label>
        <select
          id={`hf-convert-type-${blockId}`}
          className="hf-block-convert-select"
          value={convertTargetType}
          onChange={(e) => setConvertTargetType(e.target.value as CuratedHomepageBlockType)}
        >
          {convertTargets.map((t) => (
            <option key={t} value={t}>
              {HOMEPAGE_PAGE_BLOCK_CONFIG[t].label}
              {t === currentBlockType ? ' (current)' : ''}
            </option>
          ))}
        </select>
        {convertSlotsFixed ? (
          <span className="hf-block-convert-slot-note">{convertCfg.defaultSlotCount} slots</span>
        ) : (
          <>
            <span className="hf-block-convert-label">Slots</span>
            <div className="hf-block-convert-counts">
              {convertCfg.quickSlotCounts.map((count) => (
                <button
                  key={count}
                  type="button"
                  className={`hf-btn-ghost${convertSlotCount === count ? ' active' : ''}`}
                  onClick={() => setConvertSlotCount(count)}
                >
                  {count}
                </button>
              ))}
            </div>
            <input
              type="number"
              className="hf-slot-count-input hf-block-convert-custom"
              min={convertCfg.minSlotCount}
              max={convertCfg.maxSlotCount}
              aria-label="Custom slot count"
              value={convertSlotCount}
              onChange={(e) => setConvertSlotCount(Number(e.target.value))}
            />
          </>
        )}
        <button
          type="button"
          className="hf-btn-primary"
          disabled={!token || convertMutation.isPending || isNoOp}
          onClick={handleConvert}
        >
          {actionLabel}
        </button>
      </div>
      {isNoOp ? (
        <p className="hf-block-settings-hint">Choose a different type or slot count to apply a change.</p>
      ) : null}
      {convertMutation.isError ? (
        <p className="hf-block-section-heading-error">
          {convertMutation.error instanceof Error
            ? convertMutation.error.message
            : 'Failed to convert block.'}
        </p>
      ) : null}
    </section>
  )
}
