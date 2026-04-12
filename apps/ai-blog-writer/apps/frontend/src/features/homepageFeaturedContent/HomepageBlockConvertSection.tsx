import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'

import { HOMEPAGE_PAGE_BLOCK_CONFIG, type CuratedHomepageBlockType } from './pageBlocks'

type Props = {
  blockId: string
  token: string | null
  /** Allowed destination types (caller should exclude current `blockType`). */
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

  const [convertTargetType, setConvertTargetType] = useState<CuratedHomepageBlockType>(
    convertTargets[0] ?? 'article-grid',
  )
  const [convertSlotCount, setConvertSlotCount] = useState(
    convertTargets[0] ? HOMEPAGE_PAGE_BLOCK_CONFIG[convertTargets[0]].defaultSlotCount : 4,
  )

  useEffect(() => {
    if (convertTargets.length === 0) return
    if (!convertTargets.includes(convertTargetType)) {
      const next = convertTargets[0]
      setConvertTargetType(next)
      setConvertSlotCount(HOMEPAGE_PAGE_BLOCK_CONFIG[next].defaultSlotCount)
    }
  }, [convertTargets, convertTargetType])

  useEffect(() => {
    if (!convertTargets.includes(convertTargetType)) return
    setConvertSlotCount(HOMEPAGE_PAGE_BLOCK_CONFIG[convertTargetType].defaultSlotCount)
  }, [convertTargetType, convertTargets])

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

  function handleConvert() {
    if (!canConvert || !token) return
    let n = convertSlotCount
    if (convertSlotsFixed) {
      n = convertCfg.defaultSlotCount
    } else {
      n = Math.min(Math.max(Math.trunc(n), convertCfg.minSlotCount), convertCfg.maxSlotCount)
    }
    convertMutation.mutate({ blockType: convertTargetType, slotCount: n })
  }

  if (!canConvert || convertTargets.length === 0) {
    return null
  }

  return (
    <section className="hf-block-settings-section">
      <h3 className="hf-block-settings-kicker">Change block type</h3>
      <p className="hf-block-settings-hint">
        Nothing saved in this block yet. Switch to another block type; your section title is kept
        when supported.
      </p>
      <div className="hf-block-convert-row">
        <label className="hf-block-convert-label" htmlFor={`hf-convert-type-${blockId}`}>
          New type
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
          disabled={!token || convertMutation.isPending}
          onClick={handleConvert}
        >
          {convertMutation.isPending ? 'Converting…' : 'Convert block'}
        </button>
      </div>
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
