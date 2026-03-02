import { useEffect, useMemo, useState } from 'react'
import { FeaturedImagePicker } from '../../../../components/FeaturedImagePicker'
import { MarkdownBlockEditor } from '../../../staging/features/markdown-editor'
import { fetchMediaAssets as fetchPayloadMediaAssets } from '../../../staging/api/payload/payload.api'
import type { MediaAsset } from '../../../staging/api/payload/payload.types'
import type { MediaAssetOption, SingleTypeListicleDraft } from '../../types'
import { resolveImageUrl } from '../utils/item-media.utils'

type AiRewriteInput = {
  blockId: string
  currentContent: string
  prompt: string
  includeWholeArticleContext: boolean
}

type BuilderHeaderPanelProps = {
  draft: SingleTypeListicleDraft
  token: string | null
  locationRef: number | null
  mediaAssets: MediaAssetOption[]
  updateHeader: (next: Partial<SingleTypeListicleDraft['header']>) => void
  onIntroAiRewrite: (input: AiRewriteInput) => Promise<string>
  isLocked: boolean
  onContinueStep2: () => void
  onUpdateStep2: () => void
  onSaveStep2: () => void
  onCancelStep2Update: () => void
}

export function BuilderHeaderPanel({
  draft,
  token,
  locationRef,
  mediaAssets,
  updateHeader,
  onIntroAiRewrite,
  isLocked,
  onContinueStep2,
  onUpdateStep2,
  onSaveStep2,
  onCancelStep2Update,
}: BuilderHeaderPanelProps) {
  const resolvedToken = token ?? ''
  const [pickerOpen, setPickerOpen] = useState(false)
  const [fetchedFeaturedAsset, setFetchedFeaturedAsset] = useState<MediaAssetOption | null>(null)

  const featuredImageId = draft.header.featuredImage
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
      variant: asset.variant as MediaAsset['variant'],
    })),
    [mediaAssets],
  )
  useEffect(() => {
    if (!featuredImageId || selectedFeaturedAsset || !resolvedToken) {
      setFetchedFeaturedAsset(null)
      return
    }

    let cancelled = false

    const loadSelectedAsset = async () => {
      try {
        const response = await fetchPayloadMediaAssets(resolvedToken, {
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
          url: asset.url,
          alt: asset.alt,
          alt_text: asset.alt_text,
          altText: asset.altText,
          variant: asset.variant,
        })
      } catch {
        if (!cancelled) setFetchedFeaturedAsset(null)
      }
    }

    void loadSelectedAsset()

    return () => {
      cancelled = true
    }
  }, [featuredImageId, selectedFeaturedAsset, resolvedToken])

  const featuredAsset = selectedFeaturedAsset || fetchedFeaturedAsset
  const featuredImagePreviewUrl = featuredAsset ? resolveImageUrl(featuredAsset) : undefined
  const triggerLabel = featuredImageId
    ? featuredAsset?.filename || `Image #${featuredImageId} selected`
    : 'Select Featured Image...'
  const headerPreviewTitle = draft.title.trim() || 'Your article headline will appear here'
  const isPlaceholder = !featuredImageId

  return (
    <section className="stl-panel">
      <div className="stl-panel-header">
        <h2>
          <span className="stl-kicker">Step 2</span> Header
        </h2>
        <div className="stl-inline-actions">
          {!draft.step2_complete ? (
            <button type="button" className="stl-btn" onClick={onContinueStep2}>
              Continue
            </button>
          ) : null}
          {draft.step2_complete && !draft.step2_in_update_mode ? (
            <button type="button" className="stl-btn stl-btn-secondary" onClick={onUpdateStep2}>
              Update Header
            </button>
          ) : null}
          {draft.step2_in_update_mode ? (
            <>
              <button type="button" className="stl-btn" onClick={onSaveStep2}>
                Save Header
              </button>
              <button type="button" className="stl-btn stl-btn-secondary" onClick={onCancelStep2Update}>
                Cancel
              </button>
            </>
          ) : null}
        </div>
      </div>

      <fieldset className="stl-panel-fieldset" disabled={isLocked}>
        <div className="stl-field">
          <span>Featured Image</span>
          {!featuredImageId ? (
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

        <label className="stl-field">
          <span>Intro *</span>
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
            onAiRewrite={onIntroAiRewrite}
            placeholder="Write the listicle intro..."
            className="stl-markdown-textarea"
            rows={6}
          />
        </label>
        {!draft.header.introMarkdown.trim() && draft.header.introJsonText?.trim() ? (
          <p className="stl-legacy-note">
            Existing intro is stored in Payload as Lexical JSON. Editing here will replace it with markdown-converted content.
          </p>
        ) : null}
      </fieldset>

      <FeaturedImagePicker
        isOpen={pickerOpen}
        selectedId={featuredImageId}
        token={resolvedToken}
        locationRef={locationRef}
        payloadVariant="wide"
        prefetchedPayloadAssets={prefetchedPayloadAssets}
        onSelect={(id) => updateHeader({ featuredImage: id })}
        onClose={() => setPickerOpen(false)}
      />
    </section>
  )
}
