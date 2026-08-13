import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { FeaturedImagePicker } from '../../../components/FeaturedImagePicker'
import { MarkdownBlockEditor } from '../../markdown-editor'
import { fetchMediaAssets as fetchPayloadMediaAssets, fetchMediaSets } from '../../api/payload/payload.api'
import type { MediaAsset, MediaSet } from '../../api/payload/payload.types'
import type { MediaAssetOption } from '../types'
import { resolveImageUrl } from '../utils/item-media.utils'
import { formatMediaSetLabel, resolveMediaSetPreviewUrl } from '../../images/picker/mediaSet.utils'
import { BuilderStepHeader } from './BuilderStepHeader'

type HeaderShape = {
  featuredImage: number | null
  featuredMediaSet?: number | null
  introMarkdown: string
  introJsonText?: string
}

type DraftLike = {
  draftId: string
  title: string
  step2_complete: boolean
  step2_in_update_mode: boolean
  header: HeaderShape
}

export type BuilderHeaderPanelProps<TDraft extends DraftLike> = {
  draft: TDraft
  locationRef: number | null
  mediaAssets: MediaAssetOption[]
  updateHeader: (next: Partial<HeaderShape>) => void
  isLocked: boolean
  isSynced?: boolean
  onContinueStep2: () => void
  onUpdateStep2: () => void
  onSaveStep2: () => void
  onCancelStep2Update: () => void
  headerPreviewTitleFallback: string
  introPlaceholder: string
  uploadExternalRefBase?: string
  uploadFileNameTitle?: string
  /** Caller renders the AI button(s) shown in the intro label row. */
  renderIntroAiActions: () => ReactNode
  /** Optional action(s) shown beside the featured image label. */
  renderFeaturedImageActions?: () => ReactNode
  /** Optional. Wrap the intro editor (e.g. with an AI-active indicator shell). */
  renderIntroEditorWrapper?: (editor: ReactNode) => ReactNode
  /** Optional. Extra class appended to the intro field's label row (e.g. listicle uses `stl-ai-field-label-row`). */
  introLabelRowExtraClassName?: string
  /** Optional. Extra class appended to the intro field's actions wrapper (e.g. listicle uses `stl-ai-field-actions`). */
  introActionsExtraClassName?: string
}

export function BuilderHeaderPanel<TDraft extends DraftLike>({
  draft,
  locationRef,
  mediaAssets,
  updateHeader,
  isLocked,
  isSynced = false,
  onContinueStep2,
  onUpdateStep2,
  onSaveStep2,
  onCancelStep2Update,
  headerPreviewTitleFallback,
  introPlaceholder,
  uploadExternalRefBase,
  uploadFileNameTitle,
  renderIntroAiActions,
  renderFeaturedImageActions,
  renderIntroEditorWrapper,
  introLabelRowExtraClassName,
  introActionsExtraClassName,
}: BuilderHeaderPanelProps<TDraft>) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [fetchedFeaturedAsset, setFetchedFeaturedAsset] = useState<MediaAssetOption | null>(null)
  const [fetchedFeaturedMediaSet, setFetchedFeaturedMediaSet] = useState<MediaSet | null>(null)

  const featuredImageId = draft.header.featuredImage
  const featuredMediaSetId = draft.header.featuredMediaSet ?? null
  const selectedFeaturedAsset = useMemo(
    () => mediaAssets.find((asset) => asset.id === featuredImageId) || null,
    [featuredImageId, mediaAssets],
  )
  const prefetchedPayloadAssets = useMemo<MediaAsset[]>(
    () => mediaAssets.map((asset) => ({
      id: asset.id,
      filename: asset.filename,
      url: asset.url,
      alt: asset.alt,
      alt_text: asset.alt_text,
      altText: asset.altText,
      mediaSet: asset.mediaSet,
      variant: asset.variant as MediaAsset['variant'],
    })),
    [mediaAssets],
  )

  useEffect(() => {
    if (!featuredImageId || selectedFeaturedAsset) {
      setFetchedFeaturedAsset(null)
      return
    }

    let cancelled = false

    const loadSelectedAsset = async () => {
      try {
        const response = await fetchPayloadMediaAssets({
          id: featuredImageId,
          limit: 1,
        })
        if (cancelled) return
        const asset = response.docs?.[0]
        if (!asset) {
          setFetchedFeaturedAsset(null)
          return
        }
        setFetchedFeaturedAsset({
          id: asset.id,
          filename: asset.filename,
          url: asset.url ?? undefined,
          alt: asset.alt ?? undefined,
          alt_text: asset.alt_text ?? undefined,
          altText: asset.altText ?? undefined,
          mediaSet: asset.mediaSet,
          variant: asset.variant ?? undefined,
        })
      } catch {
        if (!cancelled) setFetchedFeaturedAsset(null)
      }
    }

    void loadSelectedAsset()

    return () => {
      cancelled = true
    }
  }, [featuredImageId, selectedFeaturedAsset])

  useEffect(() => {
    if (!featuredMediaSetId) {
      setFetchedFeaturedMediaSet(null)
      return
    }

    let cancelled = false

    const loadSelectedMediaSet = async () => {
      try {
        const response = await fetchMediaSets({
          id: featuredMediaSetId,
          limit: 1,
        })
        if (cancelled) return
        setFetchedFeaturedMediaSet(response.docs?.[0] ?? null)
      } catch {
        if (!cancelled) setFetchedFeaturedMediaSet(null)
      }
    }

    void loadSelectedMediaSet()

    return () => {
      cancelled = true
    }
  }, [featuredMediaSetId])

  const featuredAsset = selectedFeaturedAsset || fetchedFeaturedAsset
  const featuredMediaSetPreviewUrl = fetchedFeaturedMediaSet ? resolveMediaSetPreviewUrl(fetchedFeaturedMediaSet) : undefined
  const featuredImagePreviewUrl = featuredMediaSetPreviewUrl || (featuredAsset ? resolveImageUrl(featuredAsset) : undefined)
  const selectedFeaturedId = featuredMediaSetId || featuredImageId
  const triggerLabel = selectedFeaturedId
    ? featuredMediaSetId
      ? (fetchedFeaturedMediaSet ? formatMediaSetLabel(fetchedFeaturedMediaSet) : `MediaSet #${featuredMediaSetId} selected`)
      : featuredAsset?.filename || `Image #${featuredImageId} selected`
    : 'Select Featured Image...'
  const headerPreviewTitle = draft.title.trim() || headerPreviewTitleFallback
  const isPlaceholder = !selectedFeaturedId

  const introEditor = (
    <MarkdownBlockEditor
      blockId={`${draft.draftId}_header_intro`}
      value={draft.header.introMarkdown}
      onChange={(nextValue) =>
        updateHeader({
          introMarkdown: nextValue,
          introJsonText: '',
        })
      }
      showToolbar
      enforceHeadingStructure={false}
      placeholder={introPlaceholder}
      className="stl-markdown-textarea"
      rows={6}
      ariaLabel="Intro"
    />
  )

  return (
    <section className="stl-panel">
      <BuilderStepHeader
        stepLabel="Step 2"
        title="Header"
        isSynced={isSynced}
        isStepComplete={draft.step2_complete}
        isInUpdateMode={draft.step2_in_update_mode}
        onContinue={onContinueStep2}
        onUpdate={onUpdateStep2}
        onSave={onSaveStep2}
        onCancelUpdate={onCancelStep2Update}
        updateLabel="Update Header"
        saveLabel="Save Header"
      />

      <fieldset className="stl-panel-fieldset" disabled={!isSynced && isLocked}>
        <div className="stl-field">
          <div className="stl-field-label-row">
            <span>Featured Image</span>
            {renderFeaturedImageActions ? (
              <div className="stl-inline-actions">{renderFeaturedImageActions()}</div>
            ) : null}
          </div>
          {!selectedFeaturedId ? (
            <button
              type="button"
              className="stl-picker-trigger"
              onClick={() => setPickerOpen(true)}
            >
              <span className="stl-picker-trigger__preview">
                <span className={`stl-picker-trigger__label${isPlaceholder ? ' stl-picker-trigger__label--placeholder' : ''}`}>
                  {triggerLabel}
                </span>
              </span>
              <span className="stl-picker-trigger__caret">▼</span>
            </button>
          ) : (
            <div className="stl-featured-header-preview">
              <button
                type="button"
                className="stl-featured-header-preview__media"
                onClick={() => setPickerOpen(true)}
              >
                {featuredImagePreviewUrl ? (
                  <img src={featuredImagePreviewUrl} alt="" />
                ) : (
                  <div className="stl-featured-header-preview__fallback">Image selected</div>
                )}
                <div className="stl-featured-header-preview__overlay">
                  <p className="stl-featured-header-preview__title">{headerPreviewTitle}</p>
                </div>
              </button>
            </div>
          )}
        </div>

        <div className="stl-field">
          <div className={['stl-field-label-row', introLabelRowExtraClassName].filter(Boolean).join(' ')}>
            <span>Intro *</span>
            <div className={['stl-inline-actions', introActionsExtraClassName].filter(Boolean).join(' ')}>
              {renderIntroAiActions()}
            </div>
          </div>
          {renderIntroEditorWrapper ? renderIntroEditorWrapper(introEditor) : introEditor}
        </div>
        {!draft.header.introMarkdown.trim() && draft.header.introJsonText?.trim() ? (
          <p className="stl-legacy-note">
            Existing intro is stored in Payload as Lexical JSON. Editing here will replace it with markdown-converted content.
          </p>
        ) : null}
      </fieldset>

      <FeaturedImagePicker
        isOpen={pickerOpen}
        selectedId={featuredMediaSetId}
       
        locationRef={locationRef}
        payloadSourceMode="mediaSets"
        payloadVariant="wide"
        uploadExternalRefBase={uploadExternalRefBase}
        uploadFileNameTitle={uploadFileNameTitle}
        prefetchedPayloadAssets={prefetchedPayloadAssets}
        onSelect={(id) => updateHeader({ featuredImage: id, featuredMediaSet: null })}
        onSelectMediaSet={(id) => updateHeader({ featuredMediaSet: id, featuredImage: null })}
        onClose={() => setPickerOpen(false)}
      />
    </section>
  )
}
