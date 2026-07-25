import { useEffect, useMemo, useState } from 'react'
import type {
  InstagramPostOption,
  ItineraryBlockType,
  ItineraryItemBlock,
  ListicleItineraryDraft,
  MediaAssetOption,
  RelatedItemOption
} from '../../types'
import { isManualItineraryBlockType as isManualBlockType } from '../../types'
import {
  getRelatedInstagramPostObjects,
  getRelatedPhotoObjects,
  requiresInstagram,
  requiresPhotos
} from '../../../../shared/builder/utils/item-media.utils'
import type { ComposeStopReasonResult } from '../services/compose-stop-reason.service'
import { useManualStopImageAssets } from '../hooks/useManualStopImageAssets'
import { getAvailableMediaModeOptions } from '../utils/stopMediaMode.utils'
import { BuilderStopRow, type ActivePicker } from './stops/BuilderStopRow'

type BuilderStopsPanelProps = {
  draft: ListicleItineraryDraft
  /** Index of the day tab being edited (0-based). */
  activeDayIndex: number
  token: string | null
  locationRef: number | null
  mediaAssets: MediaAssetOption[]
  instagramPosts: InstagramPostOption[]
  isLoadingRelated: boolean
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>
  onAddWhereStaying: () => void
  onAddItem: (insertIndex?: number) => void
  onMoveItem: (itemId: string, direction: 'up' | 'down') => void
  onRemoveItem: (itemId: string) => void
  onUpdateItem: (
    itemId: string,
    updater: (item: ItineraryItemBlock) => ItineraryItemBlock
  ) => void
  onStopBlurbAiAutoWrite: (itemId: string) => Promise<void>
  /** Refine an operator's rough "why this pick" note into a Selection reason (ADR 0020). */
  onRefineStopReason: (
    itemId: string,
    roughReason: string
  ) => Promise<ComposeStopReasonResult>
  activeAiItemId: string | null
  /** Compose the active day's stop blurbs as one narrative set (ADR 0019). */
  onComposeActiveDayBlurbs: () => void
  /** Walk every composable day in order, skipping composed-clean days. */
  onComposeAllDayBlurbs: () => void
  /** Why the active day cannot be composed, or undefined when ready. */
  activeDayBlurbDisabledReason?: string
  /** How many days the "all days" pass would compose. */
  composableDayCount: number
  isComposingDayBlurbs: boolean
  hasDayBlurbReport: boolean
  onViewDayBlurbReport: () => void
  isLocked: boolean
  isSynced?: boolean
  onContinueStep3: () => void
  onUpdateStep3: () => void
  onSaveStep3: () => void
  onCancelStep3Update: () => void
}

export function BuilderStopsPanel({
  draft,
  activeDayIndex,
  token,
  locationRef,
  mediaAssets,
  instagramPosts,
  isLoadingRelated,
  relatedByBlockType,
  onAddWhereStaying,
  onAddItem,
  onMoveItem,
  onRemoveItem,
  onUpdateItem,
  onStopBlurbAiAutoWrite,
  onRefineStopReason,
  activeAiItemId,
  onComposeActiveDayBlurbs,
  onComposeAllDayBlurbs,
  activeDayBlurbDisabledReason,
  composableDayCount,
  isComposingDayBlurbs,
  hasDayBlurbReport,
  onViewDayBlurbReport,
  isLocked,
  isSynced = false,
  onContinueStep3,
  onUpdateStep3,
  onSaveStep3,
  onCancelStep3Update
}: BuilderStopsPanelProps) {
  const resolvedToken = token ?? ''
  const dayDraft = useMemo(() => {
    const day = draft.days[activeDayIndex] ?? draft.days[0]
    return (
      day ?? {
        id: '',
        whereStaying: [] as ItineraryItemBlock[],
        items: [] as ItineraryItemBlock[]
      }
    )
  }, [draft.days, activeDayIndex])
  const [activePicker, setActivePicker] = useState<ActivePicker>(null)
  const [photoPreviewIndexByItem, setPhotoPreviewIndexByItem] = useState<
    Record<string, number>
  >({})
  const [
    activeInstagramEmbedPreviewItemId,
    setActiveInstagramEmbedPreviewItemId
  ] = useState<string | null>(null)
  const [imagePickerItemId, setImagePickerItemId] = useState<string | null>(
    null
  )

  const step3Rows = useMemo(
    () => [
      ...dayDraft.whereStaying.map((item, index) => ({
        item,
        section: 'whereStaying' as const,
        localIndex: index
      })),
      ...dayDraft.items.map((item, index) => ({
        item,
        section: 'stops' as const,
        localIndex: index
      }))
    ],
    [dayDraft.whereStaying, dayDraft.items]
  )

  const allStep3Items = useMemo(
    () => [...dayDraft.whereStaying, ...dayDraft.items],
    [dayDraft.whereStaying, dayDraft.items]
  )
  const fetchedManualImageAssets = useManualStopImageAssets({
    token: resolvedToken,
    items: allStep3Items,
    mediaAssets
  })

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
    ;[...dayDraft.whereStaying, ...dayDraft.items].forEach((item) => {
      if (isManualBlockType(item.blockType)) {
        return
      }

      const relatedOptions = relatedByBlockType[item.blockType] || []
      const selectedRelatedItem =
        relatedOptions.find((entry) => entry.id === item.item) || null
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
      onUpdateItem(item.id, (current) => ({
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
  }, [dayDraft.whereStaying, dayDraft.items, onUpdateItem, relatedByBlockType])

  return (
    <section className="stl-panel">
      <div className="stl-panel-header">
        <h2>
          {!isSynced ? <span className="stl-kicker">Step 3</span> : null}{' '}
          Lodging & stops
          <span className="stl-step3-header-counts">
            {' '}
            {draft.dayCount > 1 ? `Day ${activeDayIndex + 1} · ` : ''}(
            {dayDraft.whereStaying.length} lodging · {dayDraft.items.length}{' '}
            stops)
          </span>
        </h2>
        <div className="stl-inline-actions">
          <button type="button" className="stl-btn" onClick={onAddWhereStaying}>
            Add lodging
          </button>
          <button type="button" className="stl-btn" onClick={() => onAddItem()}>
            Add stop
          </button>
          {!isSynced ? (
            <>
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
                  Update Stops
                </button>
              ) : null}
              {draft.step3_in_update_mode ? (
                <>
                  <button
                    type="button"
                    className="stl-btn"
                    onClick={onSaveStep3}
                  >
                    Save Stops
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
            </>
          ) : null}
        </div>
      </div>

      {draft.planOverview?.trim() ? (
        <div className="stl-plan-overview" role="note">
          <span className="stl-plan-overview-label">ⓘ AI plan overview</span>
          <p className="stl-plan-overview-text">{draft.planOverview}</p>
        </div>
      ) : null}

      <div
        className="stl-blurb-compose-bar"
        role="group"
        aria-label="AI stop blurbs"
      >
        <div className="stl-blurb-compose-bar__copy">
          <span className="stl-blurb-compose-bar__title">AI stop blurbs</span>
          <span className="stl-blurb-compose-bar__hint">
            {activeDayBlurbDisabledReason
              ? activeDayBlurbDisabledReason
              : `Writes Day ${activeDayIndex + 1}'s blurbs as one connected narrative.`}
          </span>
        </div>
        <div className="stl-inline-actions">
          <button
            type="button"
            className="stl-btn"
            onClick={onComposeActiveDayBlurbs}
            disabled={
              isComposingDayBlurbs || Boolean(activeDayBlurbDisabledReason)
            }
            title={activeDayBlurbDisabledReason}
          >
            {isComposingDayBlurbs
              ? 'Composing…'
              : `Write Day ${activeDayIndex + 1} blurbs`}
          </button>
          {draft.dayCount > 1 ? (
            <button
              type="button"
              className="stl-btn stl-btn-secondary"
              onClick={onComposeAllDayBlurbs}
              disabled={isComposingDayBlurbs || composableDayCount < 1}
              title={
                composableDayCount < 1
                  ? 'No days are ready to compose'
                  : undefined
              }
            >
              {`Write all days (${composableDayCount})`}
            </button>
          ) : null}
          {hasDayBlurbReport ? (
            <button
              type="button"
              className="stl-btn stl-btn-secondary"
              onClick={onViewDayBlurbReport}
            >
              View report
            </button>
          ) : null}
        </div>
      </div>

      <fieldset className="stl-panel-fieldset" disabled={!isSynced && isLocked}>
        {isLoadingRelated ? (
          <p className="stl-placeholder">Loading related items...</p>
        ) : null}

        <div className="stl-list">
          {step3Rows.map((row, idx) => (
            <BuilderStopRow
              key={row.item.id}
              row={row}
              showHeading={
                idx === 0 || step3Rows[idx - 1].section !== row.section
              }
              token={resolvedToken}
              locationRef={locationRef}
              mediaAssets={mediaAssets}
              instagramPosts={instagramPosts}
              relatedByBlockType={relatedByBlockType}
              fetchedManualImageAssets={fetchedManualImageAssets}
              activePicker={activePicker}
              photoPreviewIndexByItem={photoPreviewIndexByItem}
              activeInstagramEmbedPreviewItemId={
                activeInstagramEmbedPreviewItemId
              }
              imagePickerItemId={imagePickerItemId}
              activeAiItemId={activeAiItemId}
              isLocked={isLocked}
              onAddItem={onAddItem}
              onMoveItem={onMoveItem}
              onRemoveItem={onRemoveItem}
              onUpdateItem={onUpdateItem}
              onStopBlurbAiAutoWrite={onStopBlurbAiAutoWrite}
              onRefineStopReason={onRefineStopReason}
              setActivePicker={setActivePicker}
              setPhotoPreviewIndexByItem={setPhotoPreviewIndexByItem}
              setActiveInstagramEmbedPreviewItemId={
                setActiveInstagramEmbedPreviewItemId
              }
              setImagePickerItemId={setImagePickerItemId}
            />
          ))}
        </div>
      </fieldset>
    </section>
  )
}
