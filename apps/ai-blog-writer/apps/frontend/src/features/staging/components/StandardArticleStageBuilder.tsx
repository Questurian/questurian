import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../providers/useAuth'
import type { TripIntent } from '../../trip-intent'
import { TRIP_INTENT_OPTIONS } from '../../trip-intent'
import {
  generateSocialImageFromFeatured as requestGenerateSocialImageFromFeatured,
  uploadSocialImage as requestUploadSocialImage,
} from '../../images'
import { SeoEditorPanel } from '../../shared/seo/components/SeoEditorPanel'
import { getSchemaPublisherConfig } from '../../shared/seo/services/schema-publisher-config.service'
import {
  applySeoAiPatch,
  buildSeoAiSeed,
  parseSeoAiPatch,
  type SeoAiTarget,
} from '../../shared/seo/services/seo-ai.service'
import { createEmptySeoSection } from '../../shared/seo/services/seo-section.service'
import { resolveEditorAssistModelName } from '../api'
import type { EditorialStageArticleApi, EditorialStageRoutes } from '../features/editorial-stage-article/types'
import { useEditorialStageArticleScreenViewModel } from '../features/editorial-stage-article/hooks/useEditorialStageArticleScreenViewModel'
import { EDITOR_MODEL_OPTIONS, resolveEditorModelName } from '../features/editorial-stage-article/constants'
import { getLocationDisplayName } from '../features/editorial-stage-article/utils/editorial-stage-view.utils'
import {
  buildStandardArticleContext,
  buildLegacyStandardArticleStructuredDataTemplate,
  buildStandardArticleSeoAiPrompt,
  shouldAutoManageStandardArticleStructuredData,
  buildStandardArticleStructuredDataTemplate,
  isSeoCoreComplete,
  serializeStandardArticleStructuredDataTemplate,
  validateStandardArticleSeoSection,
} from '../features/editorial-stage-article/services/standard-article-seo.service'
import {
  buildPrimaryLocationUpdate,
  getSharedNeighborhoodOptions,
  sanitizeSharedNeighborhoods,
} from '../features/editorial-stage-article/utils/sharedNeighborhoods'
import { FeaturedImageModal } from './editorial-stage/FeaturedImageModal'
import { BlockImageModal } from './editorial-stage/BlockImageModal'
import { EditorialTimelineList } from './editorial-stage/EditorialTimelineList'
import '../../singleTypeListicles/styles.css'
import './standard-article-stage-builder.css'

type StandardArticleStageBuilderProps = {
  storageKey: string
  routes: EditorialStageRoutes
  api: EditorialStageArticleApi
  featureLabel: string
  heroEyebrow?: string
  heroDescription: string
  syncBehavior?: 'finalize' | 'draft-sync'
}

function validateSetupStep(title: string, locationId?: number, tripIntent?: TripIntent[]): string[] {
  const issues: string[] = []
  if (!title.trim()) issues.push('Step 1 requires an article title.')
  if (!locationId) issues.push('Step 1 requires a location.')
  if (!tripIntent || tripIntent.length === 0) issues.push('Step 1 requires at least one trip intent.')
  return issues
}

function validateFeaturedImageStep(featuredImageId?: number): string[] {
  return featuredImageId ? [] : ['Step 2 requires a featured image.']
}

function validateContentStep(input: {
  bodyMarkdown: string
  editorialBlockingMessages: string[]
}): string[] {
  const issues: string[] = []
  if (!input.bodyMarkdown.trim()) {
    issues.push('Step 3 requires at least one text block with content.')
  }
  if (input.editorialBlockingMessages.length > 0) {
    issues.push(input.editorialBlockingMessages[0])
  }
  return issues
}

const schemaPublisherConfig = getSchemaPublisherConfig()

export function StandardArticleStageBuilder({
  storageKey,
  routes,
  api,
  featureLabel,
  heroEyebrow = `${featureLabel} Article Builder`,
  heroDescription,
  syncBehavior = 'draft-sync',
}: StandardArticleStageBuilderProps) {
  const { token, user } = useAuth()
  const [localError, setLocalError] = useState<string | null>(null)
  const [localResult, setLocalResult] = useState<string | null>(null)
  const [isGeneratingSeoTarget, setIsGeneratingSeoTarget] = useState<SeoAiTarget | null>(null)
  const [isGeneratingSeoImage, setIsGeneratingSeoImage] = useState(false)
  const [isUploadingOgImage, setIsUploadingOgImage] = useState(false)
  const lastAutoStructuredDataRef = useRef<string>('')

  const viewModel = useEditorialStageArticleScreenViewModel({
    storageKey,
    routes,
    syncBehavior,
    api,
    token,
  })

  const { status, layout, timelineListProps, sidebarProps, featuredModalProps, blockModalProps } = viewModel
  const stagedArticle = layout?.stagedArticle
  const seoSection = stagedArticle?.seoSection ?? createEmptySeoSection()
  const selectedLocation = useMemo(
    () => sidebarProps?.locations.find((location) => location.id === stagedArticle?.locationId),
    [sidebarProps?.locations, stagedArticle?.locationId],
  )
  const sharedNeighborhoodOptions = useMemo(
    () => getSharedNeighborhoodOptions(sidebarProps?.locations ?? [], stagedArticle?.locationId),
    [sidebarProps?.locations, stagedArticle?.locationId],
  )
  const selectedSharedNeighborhoods = useMemo(
    () => sanitizeSharedNeighborhoods(
      stagedArticle?.sharedNeighborhoods ?? [],
      sidebarProps?.locations ?? [],
      stagedArticle?.locationId
    ),
    [sidebarProps?.locations, stagedArticle?.locationId, stagedArticle?.sharedNeighborhoods],
  )
  const selectedLocationLabel = useMemo(
    () => getLocationDisplayName(selectedLocation),
    [selectedLocation],
  )
  const bodyMarkdown = useMemo(
    () => (stagedArticle ? buildStandardArticleContext(stagedArticle) : ''),
    [stagedArticle],
  )

  const step1Issues = useMemo(
    () => validateSetupStep(stagedArticle?.title || '', stagedArticle?.locationId, stagedArticle?.tripIntent),
    [stagedArticle?.title, stagedArticle?.locationId, stagedArticle?.tripIntent],
  )
  const step2Issues = useMemo(
    () => validateFeaturedImageStep(stagedArticle?.featuredImageId),
    [stagedArticle?.featuredImageId],
  )
  const step3Issues = useMemo(
    () => validateContentStep({
      bodyMarkdown,
      editorialBlockingMessages: sidebarProps?.editorialBlockingMessages || [],
    }),
    [bodyMarkdown, sidebarProps?.editorialBlockingMessages],
  )
  const seoIssues = useMemo(
    () => validateStandardArticleSeoSection({
      seoSection,
      locationLabel: selectedLocationLabel || undefined,
    }),
    [seoSection, selectedLocationLabel],
  )
  const featuredImageId = stagedArticle?.featuredImageId
  const featuredImagePreviewUrl = sidebarProps?.selectedFeaturedImage
    ? sidebarProps.getImageUrl(sidebarProps.selectedFeaturedImage)
    : undefined
  const featuredImageTriggerLabel = featuredImageId
    ? sidebarProps?.selectedFeaturedImage?.filename || `Image #${featuredImageId} selected`
    : 'Select Featured Image...'
  const selectedTripIntent = stagedArticle?.tripIntent || []
  const headerPreviewTitle = stagedArticle?.title.trim() || 'Your article headline will appear here'
  const isFeaturedImagePlaceholder = !featuredImageId
  const canManagePublished = user?.role === 'admin' || user?.role === 'editor'
  const isPublished = stagedArticle?.payloadStatus === 'published'
  const isCityPrimaryLocation = selectedLocation?.level === 'city'

  const isStep1Locked = Boolean(stagedArticle?.step1_complete && !stagedArticle?.in_update_mode)
  const isStep2Locked = Boolean(stagedArticle?.step2_complete && !stagedArticle?.step2_in_update_mode)
  const isStep3Locked = Boolean(stagedArticle?.step3_complete && !stagedArticle?.step3_in_update_mode)
  const seoCoreComplete = isSeoCoreComplete(seoSection)
  const completionPercent = Math.round(([
    isStep1Locked,
    isStep2Locked,
    isStep3Locked,
    seoCoreComplete,
  ].filter(Boolean).length / 4) * 100)

  const syncIssues = useMemo(() => {
    const issues: string[] = []
    if (!isStep1Locked) issues.push('Lock Step 1 before syncing to Payload.')
    if (!isStep2Locked) issues.push('Lock Step 2 before syncing to Payload.')
    if (!isStep3Locked) issues.push('Lock Step 3 before syncing to Payload.')
    if (!seoCoreComplete) issues.push('Add SEO title and meta description before syncing to Payload.')
    if (step3Issues.length > 0) issues.push(step3Issues[0])
    if (seoIssues.length > 0) issues.push(seoIssues[0])
    return issues
  }, [isStep1Locked, isStep2Locked, isStep3Locked, seoCoreComplete, seoIssues, step3Issues])

  const setStageArticle = useCallback((updates: Partial<NonNullable<typeof stagedArticle>>) => {
    sidebarProps?.onUpdateStagedArticle(updates)
  }, [sidebarProps])

  const updateSeoSection = useCallback((next: typeof seoSection | ((current: typeof seoSection) => typeof seoSection)) => {
    if (!stagedArticle || !sidebarProps) return
    const resolved = typeof next === 'function'
      ? next(stagedArticle.seoSection ?? createEmptySeoSection())
      : next
    sidebarProps.onUpdateStagedArticle({ seoSection: resolved })
  }, [sidebarProps, stagedArticle])

  useEffect(() => {
    if (!stagedArticle || !isStep3Locked) return

    const nextStructuredData = serializeStandardArticleStructuredDataTemplate(
      buildStandardArticleStructuredDataTemplate({
        stagedArticle: {
          ...stagedArticle,
          seoSection,
        },
        locationLabel: selectedLocationLabel || undefined,
        publisherConfig: schemaPublisherConfig,
      }),
    )
    const legacyStructuredData = serializeStandardArticleStructuredDataTemplate(
      buildLegacyStandardArticleStructuredDataTemplate({
        stagedArticle: {
          ...stagedArticle,
          seoSection,
        },
        locationLabel: selectedLocationLabel || undefined,
      }),
    )

    const existingStructuredData = seoSection.structuredData.trim()
    const lastAutoStructuredData = lastAutoStructuredDataRef.current.trim()
    const isAutoManaged = shouldAutoManageStandardArticleStructuredData({
      existingStructuredData,
      lastAutoStructuredData,
      nextStructuredData,
      legacyStructuredData,
    })

    if (!isAutoManaged) return
    if (existingStructuredData === nextStructuredData) {
      lastAutoStructuredDataRef.current = nextStructuredData
      return
    }

    lastAutoStructuredDataRef.current = nextStructuredData
    updateSeoSection((current) => ({
      ...current,
      structuredData: nextStructuredData,
    }))
  }, [
    isStep3Locked,
    seoSection,
    selectedLocationLabel,
    stagedArticle,
    updateSeoSection,
  ])

  const handleContinueSetup = useCallback(() => {
    if (!stagedArticle || !sidebarProps) return
    if (step1Issues.length > 0) {
      setLocalError(step1Issues[0])
      return
    }
    setLocalError(null)
    setLocalResult(null)
    sidebarProps.onUpdateStagedArticle({
      step1_complete: true,
      in_update_mode: false,
      step2_complete: false,
      step2_in_update_mode: false,
      step3_complete: false,
      step3_in_update_mode: false,
    })
  }, [sidebarProps, stagedArticle, step1Issues])

  const handleContinueFeaturedImage = useCallback(() => {
    if (!sidebarProps) return
    if (step2Issues.length > 0) {
      setLocalError(step2Issues[0])
      return
    }
    setLocalError(null)
    setLocalResult(null)
    sidebarProps.onUpdateStagedArticle({
      step2_complete: true,
      step2_in_update_mode: false,
      step3_complete: false,
      step3_in_update_mode: false,
    })
  }, [sidebarProps, step2Issues])

  const handleContinueContent = useCallback(() => {
    if (!sidebarProps) return
    if (step3Issues.length > 0) {
      setLocalError(step3Issues[0])
      return
    }
    setLocalError(null)
    setLocalResult(null)
    sidebarProps.onUpdateStagedArticle({
      step3_complete: true,
      step3_in_update_mode: false,
    })
  }, [sidebarProps, step3Issues])

  const handleTripIntentToggle = useCallback((intent: TripIntent, checked: boolean) => {
    if (!stagedArticle || !sidebarProps) return
    if (!checked && stagedArticle.tripIntent?.length === 1 && stagedArticle.tripIntent[0] === intent) return

    const nextTripIntent = checked
      ? stagedArticle.tripIntent?.includes(intent)
        ? stagedArticle.tripIntent
        : [...(stagedArticle.tripIntent || []), intent]
      : (stagedArticle.tripIntent || []).filter((value) => value !== intent)

    if (nextTripIntent.length === 0) return

    sidebarProps.onUpdateStagedArticle({
      tripIntent: nextTripIntent,
    })
  }, [stagedArticle, sidebarProps])

  const handleGenerateSeoWithAi = useCallback(async (target: SeoAiTarget = 'all') => {
    if (!stagedArticle) return

    const articleContext = buildStandardArticleContext(stagedArticle).trim()
    const articleTitle = stagedArticle.title.trim()
    const hasSourceContent = Boolean(articleTitle || articleContext)
    if (!hasSourceContent) {
      setLocalError('Add article content before generating SEO with AI.')
      return
    }

    setLocalError(null)
    setLocalResult(null)
    setIsGeneratingSeoTarget(target)

    try {
      const response = await api.rewriteBlockWithAi({
        prompt: buildStandardArticleSeoAiPrompt({
          location: selectedLocationLabel || undefined,
          target,
        }),
        blockContent: buildSeoAiSeed(seoSection),
        modelName: resolveEditorAssistModelName(stagedArticle.editorModelName),
        articleTitle,
        articleContext: articleContext || undefined,
      })

      const aiText = response.rewritten_content?.trim()
      if (!aiText) {
        throw new Error('AI returned empty SEO content.')
      }

      const seoPatch = parseSeoAiPatch(aiText)
      updateSeoSection((current) => applySeoAiPatch(current, seoPatch, target))
      setLocalResult(`Updated ${target === 'all' ? 'SEO metadata' : target} with AI.`)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to generate SEO with AI.')
    } finally {
      setIsGeneratingSeoTarget(null)
    }
  }, [api, seoSection, selectedLocationLabel, stagedArticle, updateSeoSection])

  const handleGenerateSeoImageFromFeatured = useCallback(async () => {
    if (!token || !stagedArticle?.featuredImageId) {
      setLocalError('Select a featured image before generating an OG image.')
      return
    }

    setLocalError(null)
    setLocalResult(null)
    setIsGeneratingSeoImage(true)

    try {
      const response = await requestGenerateSocialImageFromFeatured(stagedArticle.featuredImageId, token)
      const socialImageUrl = response.generatedImageUrl.trim()
      if (!socialImageUrl) {
        throw new Error('Social image generation did not return a usable URL.')
      }

      updateSeoSection((current) => ({
        ...current,
        openGraph: {
          ...current.openGraph,
          imageUrl: socialImageUrl,
        },
        twitterCard: {
          ...current.twitterCard,
          imageUrl: socialImageUrl,
        },
      }))
      setLocalResult('Generated a 1200x630 social image from the featured image.')
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to generate social image.')
    } finally {
      setIsGeneratingSeoImage(false)
    }
  }, [stagedArticle?.featuredImageId, token, updateSeoSection])

  const handleUploadOgImageFile = useCallback(async (file: File) => {
    if (!token || !stagedArticle?.locationId) {
      throw new Error('Select a location before uploading an OG image.')
    }

    setLocalError(null)
    setLocalResult(null)
    setIsUploadingOgImage(true)

    try {
      const uploadResponse = await requestUploadSocialImage(
        file,
        stagedArticle.title.trim() || `${featureLabel} social image`,
        stagedArticle.locationId,
        token,
        '',
      )

      const socialImageUrl = uploadResponse.generatedImageUrl.trim()
      if (!socialImageUrl) {
        throw new Error('OG image upload did not return a usable URL.')
      }

      updateSeoSection((current) => ({
        ...current,
        openGraph: {
          ...current.openGraph,
          imageUrl: socialImageUrl,
        },
        twitterCard: {
          ...current.twitterCard,
          imageUrl: socialImageUrl,
        },
      }))
      setLocalResult('Uploaded and applied a custom OG image.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload OG image.'
      setLocalError(message)
      throw err instanceof Error ? err : new Error(message)
    } finally {
      setIsUploadingOgImage(false)
    }
  }, [featureLabel, stagedArticle?.locationId, stagedArticle?.title, token, updateSeoSection])

  const handlePayloadSubmit = useCallback((targetStatus: 'draft' | 'published') => {
    if (!sidebarProps) return
    if (syncIssues.length > 0) {
      setLocalError(syncIssues[0])
      return
    }
    setLocalError(null)
    setLocalResult(null)
    sidebarProps.onPublish(targetStatus)
  }, [sidebarProps, syncIssues])

  if (status.isLoading || !stagedArticle || !layout || !timelineListProps || !sidebarProps || !featuredModalProps || !blockModalProps) {
    return (
      <div className="stl-page stl-single-type-page sab-stage-page">
        <p className="stl-placeholder">{status.error ? status.error : 'Loading builder...'}</p>
      </div>
    )
  }

  return (
    <>
      <div className="stl-page stl-single-type-page sab-stage-page">
        <header className="stl-hero sab-stage-hero">
          <div>
            <p className="stl-eyebrow">{heroEyebrow}</p>
            <h1>{stagedArticle.payloadArticleId ? `Sync Draft #${stagedArticle.payloadArticleId}` : 'Stage Article'}</h1>
            <p className="stl-lede">{heroDescription}</p>
            <div className="sab-stage-hero-meta">
              {stagedArticle.originalType ? <span className="sab-stage-pill">{stagedArticle.originalType}</span> : null}
              {stagedArticle.payloadArticleId ? <span className="sab-stage-pill">Linked Payload #{stagedArticle.payloadArticleId}</span> : null}
              <span className="sab-stage-pill">{completionPercent}% ready</span>
            </div>
          </div>
          <div className="stl-hero-actions">
            <Link to={layout.stagePath} className="stl-btn stl-btn-secondary">Back to Stage List</Link>
            <button type="button" className="stl-btn stl-btn-danger" onClick={layout.onDelete}>
              Delete Staged Article
            </button>
          </div>
        </header>

        <div className="stl-builder-layout">
          <main className="stl-builder-main">
            {localError ? <p className="stl-error">{localError}</p> : null}
            {localResult ? <p className="stl-success">{localResult}</p> : null}

            <section className="stl-panel sab-stage-panel">
              <div className="stl-panel-header">
                <h2><span className="stl-kicker">Step 1</span> Setup</h2>
                <div className="stl-inline-actions">
                  {isStep1Locked ? (
                    stagedArticle.in_update_mode ? (
                      <>
                        <button type="button" className="stl-btn stl-btn-secondary" onClick={() => setStageArticle({ in_update_mode: false })}>
                          Cancel
                        </button>
                        <button type="button" className="stl-btn" onClick={handleContinueSetup}>
                          Save Setup
                        </button>
                      </>
                    ) : (
                      <button type="button" className="stl-btn stl-btn-secondary" onClick={() => setStageArticle({ in_update_mode: true })}>
                        Update Setup
                      </button>
                    )
                  ) : (
                    <button type="button" className="stl-btn" onClick={handleContinueSetup}>
                      Continue to Step 2
                    </button>
                  )}
                </div>
              </div>

              <div className="sab-stage-field-grid">
                <label className="stl-field">
                  <span>Article Title</span>
                  <input
                    value={stagedArticle.title}
                    onChange={(event) => layout.onUpdateTitle(event.target.value)}
                    placeholder="Title the article draft"
                  />
                </label>

                <label className="stl-field">
                  <span>Location</span>
                  <select
                    value={stagedArticle.locationId || ''}
                    onChange={(event) => {
                      const nextLocationId = Number(event.target.value) || undefined
                      sidebarProps.onUpdateStagedArticle(buildPrimaryLocationUpdate({
                        locations: sidebarProps.locations,
                        nextLocationId,
                        sharedNeighborhoods: stagedArticle.sharedNeighborhoods,
                      }))
                    }}
                  >
                    <option value="">Select location</option>
                    {sidebarProps.locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {getLocationDisplayName(location)}
                      </option>
                    ))}
                  </select>
                </label>

                {isCityPrimaryLocation ? (
                  <label className="stl-field">
                    <span>Shared Neighborhoods</span>
                    <small>Optional. Exact neighborhood scoping only.</small>
                    <select
                      multiple
                      value={selectedSharedNeighborhoods.map(String)}
                      onChange={(event) => {
                        const nextSharedNeighborhoods = Array.from(
                          event.currentTarget.selectedOptions,
                          (option) => Number(option.value)
                        ).filter((value) => Number.isFinite(value) && value > 0)

                        sidebarProps.onUpdateStagedArticle({
                          sharedNeighborhoods: sanitizeSharedNeighborhoods(
                            nextSharedNeighborhoods,
                            sidebarProps.locations,
                            stagedArticle.locationId
                          ),
                        })
                      }}
                      style={{ minHeight: '8rem' }}
                      disabled={sharedNeighborhoodOptions.length === 0}
                    >
                      {sharedNeighborhoodOptions.map((location) => (
                        <option key={location.id} value={location.id}>
                          {getLocationDisplayName(location)}
                        </option>
                      ))}
                    </select>
                    {sharedNeighborhoodOptions.length === 0 ? (
                      <small>No neighborhoods are available for this city yet.</small>
                    ) : null}
                  </label>
                ) : null}

                <label className="stl-field">
                  <span>AI Model</span>
                  <select
                    value={resolveEditorModelName(stagedArticle.editorModelName)}
                    onChange={(event) => sidebarProps.onUpdateStagedArticle({
                      editorModelName: resolveEditorModelName(event.target.value),
                    })}
                  >
                    {EDITOR_MODEL_OPTIONS.map((modelOption) => (
                      <option key={modelOption.value} value={modelOption.value}>
                        {modelOption.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="stl-field">
                  <span>Trip Intent *</span>
                  <div className="sab-stage-trip-intent-options stl-trip-intent-options">
                    {TRIP_INTENT_OPTIONS.map((intent) => {
                      const isChecked = selectedTripIntent.includes(intent.value)
                      const isDisabled = isStep1Locked || (isChecked && selectedTripIntent.length === 1)

                      return (
                        <label
                          key={intent.value}
                          className={`stl-trip-intent-option${isChecked ? ' is-selected' : ''}${isDisabled ? ' is-disabled' : ''}`}
                        >
                          <input
                            className="stl-trip-intent-input"
                            type="checkbox"
                            checked={isChecked}
                            disabled={isDisabled}
                            aria-label={`Trip intent ${intent.label}`}
                            onChange={(event) => handleTripIntentToggle(intent.value, event.target.checked)}
                          />
                          <span className="stl-trip-intent-copy">
                            <span className="stl-trip-intent-label">{intent.label}</span>
                            <span className="stl-trip-intent-description">{intent.description}</span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </label>
              </div>

              {isStep1Locked ? (
                <p className="sab-stage-summary">
                  Locked with title, primary location, optional shared neighborhoods, trip intent, and AI model. Updating setup will unlock later steps.
                </p>
              ) : null}
            </section>

            {isStep1Locked ? (
              <section className="stl-panel sab-stage-panel">
                <div className="stl-panel-header">
                  <h2><span className="stl-kicker">Step 2</span> Featured Image</h2>
                  <div className="stl-inline-actions">
                    {isStep2Locked ? (
                      stagedArticle.step2_in_update_mode ? (
                        <>
                          <button type="button" className="stl-btn stl-btn-secondary" onClick={() => setStageArticle({ step2_in_update_mode: false })}>
                            Cancel
                          </button>
                          <button type="button" className="stl-btn" onClick={handleContinueFeaturedImage}>
                            Save Featured Image
                          </button>
                        </>
                      ) : (
                        <button type="button" className="stl-btn stl-btn-secondary" onClick={() => setStageArticle({ step2_in_update_mode: true })}>
                          Update Featured Image
                        </button>
                      )
                    ) : (
                      <button type="button" className="stl-btn" onClick={handleContinueFeaturedImage}>
                        Continue to Step 3
                      </button>
                    )}
                  </div>
                </div>

                <fieldset className="stl-panel-fieldset" disabled={isStep2Locked}>
                  <div className="stl-field">
                    <span>Featured Image</span>
                    {!featuredImageId ? (
                      <button
                        type="button"
                        className="stl-picker-trigger"
                        onClick={sidebarProps.onOpenFeaturedImageModal}
                      >
                        <span className="stl-picker-trigger__preview">
                          <span className={`stl-picker-trigger__label${isFeaturedImagePlaceholder ? ' stl-picker-trigger__label--placeholder' : ''}`}>
                            {featuredImageTriggerLabel}
                          </span>
                        </span>
                        <span className="stl-picker-trigger__caret">▼</span>
                      </button>
                    ) : (
                      <div className="stl-featured-header-preview">
                        <button
                          type="button"
                          className="stl-featured-header-preview__media"
                          onClick={sidebarProps.onOpenFeaturedImageModal}
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
                </fieldset>
              </section>
            ) : null}

            {isStep1Locked && isStep2Locked ? (
              <section className="stl-panel sab-stage-panel sab-stage-panel-content">
                <div className="stl-panel-header">
                  <h2><span className="stl-kicker">Step 3</span> Content Blocks</h2>
                  <div className="stl-inline-actions">
                    <button type="button" className="stl-btn stl-btn-secondary" onClick={layout.onResetToOriginalBlocks}>
                      Reset to Original
                    </button>
                    {isStep3Locked ? (
                      stagedArticle.step3_in_update_mode ? (
                        <>
                          <button type="button" className="stl-btn stl-btn-secondary" onClick={() => setStageArticle({ step3_in_update_mode: false })}>
                            Cancel
                          </button>
                          <button type="button" className="stl-btn" onClick={handleContinueContent}>
                            Save Step 3
                          </button>
                        </>
                      ) : (
                        <button type="button" className="stl-btn stl-btn-secondary" onClick={() => setStageArticle({ step3_in_update_mode: true })}>
                          Update Step 3
                        </button>
                      )
                    ) : (
                      <button type="button" className="stl-btn" onClick={handleContinueContent}>
                        Continue to Step 4
                      </button>
                    )}
                  </div>
                </div>

                <div className="sab-stage-content-shell">
                  <EditorialTimelineList {...timelineListProps} />
                </div>
              </section>
            ) : null}

            {isStep1Locked && isStep2Locked && isStep3Locked ? (
              <SeoEditorPanel
                seoSection={seoSection}
                setSeoSection={updateSeoSection}
                onGenerateSeoWithAi={handleGenerateSeoWithAi}
                isGeneratingSeoTarget={isGeneratingSeoTarget}
                onGenerateSeoImageFromFeatured={handleGenerateSeoImageFromFeatured}
                isGeneratingSeoImage={isGeneratingSeoImage}
                onUploadOgImageFile={handleUploadOgImageFile}
                isUploadingOgImage={isUploadingOgImage}
                title="SEO & Sync"
              />
            ) : null}
          </main>

          <aside className="stl-builder-sidebar">
            <section className="stl-summary-card">
              <h3>Build Progress</h3>
              <div className="stl-progress-track" aria-hidden="true">
                <span className="stl-progress-bar" style={{ width: `${completionPercent}%` }} />
              </div>
              <p className="stl-summary-percent">{completionPercent}% ready</p>
              <ul className="stl-summary-list">
                <li className={isStep1Locked ? 'done' : ''}>
                  Setup: {isStep1Locked ? 'Locked' : stagedArticle.in_update_mode ? 'Editing' : 'Incomplete'}
                </li>
                <li className={isStep2Locked ? 'done' : ''}>
                  Featured image: {isStep2Locked ? 'Locked' : stagedArticle.step2_in_update_mode ? 'Editing' : isStep1Locked ? 'Ready' : 'Blocked'}
                </li>
                <li className={isStep3Locked ? 'done' : ''}>
                  Content blocks: {isStep3Locked ? 'Locked' : stagedArticle.step3_in_update_mode ? 'Editing' : isStep2Locked ? 'Ready' : 'Blocked'}
                </li>
                <li className={seoCoreComplete ? 'done' : ''}>
                  SEO core: {seoCoreComplete ? 'Complete' : 'Missing SEO title or meta description'}
                </li>
              </ul>
            </section>

            <section className="stl-summary-card stl-summary-card--quick-actions">
              <h3>Sync</h3>
              <div className="stl-summary-actions">
                {!isPublished ? (
                  <button
                    type="button"
                    className="stl-btn stl-btn-success"
                    onClick={() => handlePayloadSubmit('draft')}
                    disabled={sidebarProps.isPublishing || syncIssues.length > 0}
                  >
                    {sidebarProps.isPublishing ? 'Saving...' : 'Save Draft to Payload'}
                  </button>
                ) : null}

                {canManagePublished ? (
                  <button
                    type="button"
                    className="stl-btn"
                    onClick={() => handlePayloadSubmit('published')}
                    disabled={sidebarProps.isPublishing || syncIssues.length > 0}
                  >
                    {sidebarProps.isPublishing
                      ? 'Publishing...'
                      : isPublished
                        ? 'Update Published'
                        : 'Publish'}
                  </button>
                ) : null}
              </div>

              {stagedArticle.payloadArticleId ? (
                <p className="stl-summary-note">
                  {isPublished
                    ? `Published Payload article: #${stagedArticle.payloadArticleId}`
                    : `Linked Payload draft: #${stagedArticle.payloadArticleId}`}
                </p>
              ) : (
                <p className="stl-summary-note">First sync will create a draft article in Payload.</p>
              )}

              {!canManagePublished && !isPublished ? (
                <p className="stl-summary-note">Writers can only save drafts to Payload.</p>
              ) : null}

              {sidebarProps.publishResult ? (
                <div className={`sab-stage-sync-result ${sidebarProps.publishResult.success ? 'success' : 'error'}`}>
                  {sidebarProps.publishResult.message}
                </div>
              ) : null}

              {syncIssues.length > 0 ? (
                <div className="stl-summary-warning">
                  <strong>Sync needs attention:</strong>
                  <p>{syncIssues[0]}</p>
                </div>
              ) : null}
            </section>

            <section className="stl-summary-card">
              <h3>Draft Details</h3>
              <div className="sab-stage-meta-list">
                <p><strong>Run ID:</strong> {stagedArticle.runId || 'n/a'}</p>
                <p><strong>Location:</strong> {selectedLocationLabel || 'Not set'}</p>
                <p><strong>Created:</strong> {stagedArticle.createdAt ? new Date(stagedArticle.createdAt).toLocaleDateString() : 'n/a'}</p>
                <p><strong>Updated:</strong> {stagedArticle.updatedAt ? new Date(stagedArticle.updatedAt).toLocaleDateString() : 'n/a'}</p>
              </div>
            </section>
          </aside>
        </div>
      </div>

      <FeaturedImageModal {...featuredModalProps} />
      <BlockImageModal {...blockModalProps} />
    </>
  )
}
