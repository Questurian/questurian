import { useEffect, useState } from 'react'
import { getBlockTypeForListicleType } from '../../api'
import type {
  ListicleItemBlock,
  RelatedItemOption,
  SingleTypeListicleDraft
} from '../../types'
import {
  getListicleAngleOptions,
  resolveListicleAngleForBlockType
} from '../../types'
import {
  getRelatedInstagramPostObjects,
  getRelatedPhotoObjects,
  requiresInstagram,
  requiresPhotos
} from '../../../../shared/builder/utils/item-media.utils'
import { AngleGuidelinePreviewModal } from './AngleGuidelinePreviewModal'
import { fetchListicleGuidelines } from '../../../staging/api'
import type { ListicleGuidelinesResponse } from '../../../staging/api'
import { BuilderItemCard } from './items/BuilderItemCard'
import type { ActivePicker } from './items/item.types'
import { getAvailableMediaModeOptions } from './items/itemMedia.utils'

type BuilderItemsPanelProps = {
  draft: SingleTypeListicleDraft
  relatedItems: RelatedItemOption[]
  isLoadingRelated: boolean
  moveItem: (itemId: string, direction: 'up' | 'down') => void
  removeItem: (itemId: string) => void
  updateItem: (
    itemId: string,
    updater: (item: ListicleItemBlock) => ListicleItemBlock
  ) => void
  onItemBlurbAiAutoWrite: (itemId: string) => Promise<void>
  onItemBlurbInspect: (itemId: string, index: number) => void
  hasInspectableStepsByItemId: Record<string, boolean>
  activeAiItemId: string | null
  queuedAiItemIds: string[]
  isLocked: boolean
  isSynced?: boolean
  onContinueStep3: () => void
  onUpdateStep3: () => void
  onSaveStep3: () => void
  onCancelStep3Update: () => void
}

export function BuilderItemsPanel({
  draft,
  relatedItems,
  isLoadingRelated,
  moveItem,
  removeItem,
  updateItem,
  onItemBlurbAiAutoWrite,
  onItemBlurbInspect,
  hasInspectableStepsByItemId,
  activeAiItemId,
  queuedAiItemIds,
  isLocked,
  isSynced = false,
  onContinueStep3,
  onUpdateStep3,
  onSaveStep3,
  onCancelStep3Update
}: BuilderItemsPanelProps) {
  const [activePicker, setActivePicker] = useState<ActivePicker>(null)
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null)
  const [copyErrorItemId, setCopyErrorItemId] = useState<string | null>(null)
  const [photoPreviewIndexByItem, setPhotoPreviewIndexByItem] = useState<
    Record<string, number>
  >({})
  const [
    activeInstagramEmbedPreviewItemId,
    setActiveInstagramEmbedPreviewItemId
  ] = useState<string | null>(null)
  const [guidelinePreviewItemId, setGuidelinePreviewItemId] = useState<
    string | null
  >(null)
  const [guidelines, setGuidelines] =
    useState<ListicleGuidelinesResponse | null>(null)
  const [guidelinesLoading, setGuidelinesLoading] = useState(false)
  const [guidelinesError, setGuidelinesError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setGuidelinesLoading(true)
    fetchListicleGuidelines()
      .then((res) => {
        if (cancelled) return
        setGuidelines(res)
        setGuidelinesError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setGuidelinesError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (cancelled) return
        setGuidelinesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!copiedItemId) return
    const timer = window.setTimeout(() => setCopiedItemId(null), 1800)
    return () => window.clearTimeout(timer)
  }, [copiedItemId])

  useEffect(() => {
    if (!activeInstagramEmbedPreviewItemId) return

    const { body, documentElement } = document
    const previousBodyOverflow = body.style.overflow
    const previousBodyPaddingRight = body.style.paddingRight
    const previousHtmlOverflow = documentElement.style.overflow
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth

    body.style.overflow = 'hidden'
    documentElement.style.overflow = 'hidden'

    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`
    }

    return () => {
      body.style.overflow = previousBodyOverflow
      body.style.paddingRight = previousBodyPaddingRight
      documentElement.style.overflow = previousHtmlOverflow
    }
  }, [activeInstagramEmbedPreviewItemId])

  useEffect(() => {
    if (!draft.listicleType) return
    const expectedBlockType = getBlockTypeForListicleType(draft.listicleType)
    const validAngles = new Set(
      getListicleAngleOptions(draft.listicleType).map((option) => option.value)
    )

    draft.items.forEach((item) => {
      const normalizedAngle = resolveListicleAngleForBlockType(
        expectedBlockType,
        item.blockType === expectedBlockType &&
          item.angle &&
          validAngles.has(item.angle)
          ? item.angle
          : null
      )
      if (
        item.blockType === expectedBlockType &&
        (item.angle ?? null) === normalizedAngle
      ) {
        return
      }
      updateItem(item.id, (current) => ({
        ...current,
        blockType: expectedBlockType,
        angle: normalizedAngle
      }))
    })
  }, [draft.items, draft.listicleType, updateItem])

  useEffect(() => {
    draft.items.forEach((item) => {
      const selectedRelatedItem =
        relatedItems.find((entry) => entry.id === item.item) || null
      const hasPhotos = getRelatedPhotoObjects(selectedRelatedItem).length > 0
      const hasInstagram =
        getRelatedInstagramPostObjects(selectedRelatedItem).length > 0
      const availableOptions = getAvailableMediaModeOptions(
        hasPhotos,
        hasInstagram
      )

      if (availableOptions.length === 0) return
      if (availableOptions.some((option) => option.value === item.mediaMode))
        return

      const fallbackMode = availableOptions[0].value
      updateItem(item.id, (current) => ({
        ...current,
        mediaMode: fallbackMode,
        selectedPhotos: requiresPhotos(fallbackMode)
          ? current.selectedPhotos
          : [],
        selectedInstagramPost: requiresInstagram(fallbackMode)
          ? current.selectedInstagramPost
          : null
      }))
    })
  }, [draft.items, relatedItems, updateItem])

  const handleCopyRelatedItemTitle = async (itemId: string, title: string) => {
    if (!title.trim()) return
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable')
      }
      await navigator.clipboard.writeText(title)
      setCopiedItemId(itemId)
      setCopyErrorItemId(null)
    } catch {
      setCopiedItemId(null)
      setCopyErrorItemId(itemId)
    }
  }

  const guidelinePreviewItem = guidelinePreviewItemId
    ? (draft.items.find((entry) => entry.id === guidelinePreviewItemId) ?? null)
    : null
  const guidelinePreviewIndex = guidelinePreviewItem
    ? draft.items.findIndex((entry) => entry.id === guidelinePreviewItemId)
    : -1

  return (
    <section className="stl-panel">
      <AngleGuidelinePreviewModal
        isOpen={guidelinePreviewItem !== null}
        onClose={() => setGuidelinePreviewItemId(null)}
        itemLabel={
          guidelinePreviewItem ? `Item ${guidelinePreviewIndex + 1}` : ''
        }
        itemAngle={guidelinePreviewItem?.angle ?? null}
        listTone={draft.listTone}
        guidelines={guidelines}
        isLoading={guidelinesLoading}
        error={guidelinesError}
      />
      <div className="stl-panel-header">
        <h2>
          {!isSynced ? <span className="stl-kicker">Step 3</span> : null}
          Items ({draft.items.length}/{draft.targetItemCount})
        </h2>
        {!isSynced ? (
          <div className="stl-inline-actions">
            {!draft.step3_complete ? (
              <button
                type="button"
                className="stl-btn"
                onClick={onContinueStep3}
              >
                Continue
              </button>
            ) : null}
            {draft.step3_complete && !draft.step3_in_update_mode ? (
              <button
                type="button"
                className="stl-btn stl-btn-secondary"
                onClick={onUpdateStep3}
              >
                Update Items
              </button>
            ) : null}
            {draft.step3_in_update_mode ? (
              <>
                <button type="button" className="stl-btn" onClick={onSaveStep3}>
                  Save Items
                </button>
                <button
                  type="button"
                  className="stl-btn stl-btn-secondary"
                  onClick={onCancelStep3Update}
                >
                  Cancel
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <fieldset className="stl-panel-fieldset" disabled={!isSynced && isLocked}>
        {isLoadingRelated ? (
          <p className="stl-placeholder">Loading related items...</p>
        ) : null}
        {!isLoadingRelated &&
        draft.listicleType &&
        relatedItems.length === 0 ? (
          <p className="stl-placeholder">
            No published items found for selected location/type.
          </p>
        ) : null}

        <div className="stl-list">
          {draft.items.map((item, index) => (
            <BuilderItemCard
              key={item.id}
              draft={draft}
              item={item}
              index={index}
              relatedItems={relatedItems}
              moveItem={moveItem}
              removeItem={removeItem}
              updateItem={updateItem}
              onItemBlurbAiAutoWrite={onItemBlurbAiAutoWrite}
              onItemBlurbInspect={onItemBlurbInspect}
              hasInspectableStepsByItemId={hasInspectableStepsByItemId}
              activeAiItemId={activeAiItemId}
              queuedAiItemIds={queuedAiItemIds}
              activePicker={activePicker}
              setActivePicker={setActivePicker}
              copiedItemId={copiedItemId}
              copyErrorItemId={copyErrorItemId}
              onCopyRelatedItemTitle={handleCopyRelatedItemTitle}
              photoPreviewIndexByItem={photoPreviewIndexByItem}
              setPhotoPreviewIndexByItem={setPhotoPreviewIndexByItem}
              activeInstagramEmbedPreviewItemId={
                activeInstagramEmbedPreviewItemId
              }
              setActiveInstagramEmbedPreviewItemId={
                setActiveInstagramEmbedPreviewItemId
              }
              setGuidelinePreviewItemId={setGuidelinePreviewItemId}
            />
          ))}
        </div>
      </fieldset>
    </section>
  )
}
