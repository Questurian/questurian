import { useCallback, useState } from 'react'
import { useAuth, usePermissions } from '../../auth'
import { SeoEditorPanel } from '../../../shared/seo/components/SeoEditorPanel'
import type { SeoSection } from '../../../shared/seo/types'
import { createEmptySeoSection } from '../../../shared/seo/services/seo-section.service'
import type { EditorialStageArticleApi, EditorialStageRoutes } from '../features/editorial-stage-article/types'
import { useEditorialStageArticleScreenViewModel } from '../features/editorial-stage-article/hooks/useEditorialStageArticleScreenViewModel'
import { useStandardArticleDerivedState } from '../features/editorial-stage-article/hooks/useStandardArticleDerivedState'
import { useStandardArticleExpansion } from '../features/editorial-stage-article/hooks/useStandardArticleExpansion'
import { useStandardArticlePermalink } from '../features/editorial-stage-article/hooks/useStandardArticlePermalink'
import { useStandardArticleSeoActions } from '../features/editorial-stage-article/hooks/useStandardArticleSeoActions'
import { useStandardArticleStageActions } from '../features/editorial-stage-article/hooks/useStandardArticleStageActions'
import { useStandardArticleStructuredData } from '../features/editorial-stage-article/hooks/useStandardArticleStructuredData'
import { FeaturedImageModal } from './editorial-stage/FeaturedImageModal'
import { BlockImageModal } from './editorial-stage/BlockImageModal'
import { ArticleExpansionModal } from '../../youtube2blog/components/ArticleExpansionModal'
import { StandardArticleBuilderSidebar } from './standard-article-stage/StandardArticleBuilderSidebar'
import { StandardArticleContentPanel } from './standard-article-stage/StandardArticleContentPanel'
import { StandardArticleFeaturedImagePanel } from './standard-article-stage/StandardArticleFeaturedImagePanel'
import { StandardArticleSetupPanel } from './standard-article-stage/StandardArticleSetupPanel'
import { StandardArticleStageHero } from './standard-article-stage/StandardArticleStageHero'
import { StandardArticleStatusBanners } from './standard-article-stage/StandardArticleStatusBanners'
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
  backToStageLabel?: string
}

export function StandardArticleStageBuilder({
  storageKey,
  routes,
  api,
  featureLabel,
  heroEyebrow = `${featureLabel} Article Builder`,
  heroDescription,
  syncBehavior = 'draft-sync',
  backToStageLabel = 'Back to Stage List',
}: StandardArticleStageBuilderProps) {
  const { token } = useAuth()
  const { canManagePublished, role } = usePermissions()
  const [localError, setLocalError] = useState<string | null>(null)
  const [localResult, setLocalResult] = useState<string | null>(null)

  const viewModel = useEditorialStageArticleScreenViewModel({
    storageKey,
    routes,
    syncBehavior,
    api,
    token,
  })
  const {
    status,
    layout,
    timelineListProps,
    sidebarProps,
    featuredModalProps,
    blockModalProps,
  } = viewModel
  const stagedArticle = layout?.stagedArticle
  const derived = useStandardArticleDerivedState(stagedArticle, sidebarProps)

  const updateSeoSection = useCallback((
    next: SeoSection | ((current: SeoSection) => SeoSection),
  ) => {
    if (!stagedArticle || !sidebarProps) return
    const resolved = typeof next === 'function'
      ? next(stagedArticle.seoSection ?? createEmptySeoSection())
      : next
    sidebarProps.onUpdateStagedArticle({ seoSection: resolved })
  }, [sidebarProps, stagedArticle])

  const actions = useStandardArticleStageActions({
    stagedArticle,
    sidebarProps,
    step1Issues: derived.step1Issues,
    step3Issues: derived.step3Issues,
    syncIssues: derived.syncIssues,
    setLocalError,
    setLocalResult,
  })
  const permalink = useStandardArticlePermalink({
    api,
    stagedArticle,
    selectedLocation: derived.selectedLocation,
    updateSeoSection,
    setLocalError,
  })
  const seo = useStandardArticleSeoActions({
    api,
    token,
    stagedArticle,
    featureLabel,
    selectedLocationLabel: derived.selectedLocationLabel,
    seoSection: derived.seoSection,
    updateSeoSection,
    setLocalError,
    setLocalResult,
  })
  const expansion = useStandardArticleExpansion(stagedArticle, actions.setStageArticle)

  const structuredData = useStandardArticleStructuredData({
    stagedArticle,
    seoSection: derived.seoSection,
    selectedLocationLabel: derived.selectedLocationLabel,
    enabled: derived.isStep3Locked,
    updateSeoSection,
  })

  const generateSlug = useCallback(async () => {
    const slug = await permalink.generateSlug()
    if (slug) actions.setStageArticle({ payloadSlug: slug })
  }, [actions, permalink])

  if (
    status.isLoading
    || !stagedArticle
    || !layout
    || !timelineListProps
    || !sidebarProps
    || !featuredModalProps
    || !blockModalProps
  ) {
    return (
      <div className="stl-page stl-single-type-page sab-stage-page">
        <p className="stl-placeholder">{status.error ? status.error : 'Loading builder...'}</p>
      </div>
    )
  }

  const featuredImagePreviewUrl = sidebarProps.selectedFeaturedImage
    ? sidebarProps.getImageUrl(sidebarProps.selectedFeaturedImage)
    : undefined
  const featuredImageTriggerLabel = stagedArticle.featuredImageId
    ? sidebarProps.selectedFeaturedImage?.filename || `Image #${stagedArticle.featuredImageId} selected`
    : 'Select Featured Image...'

  return (
    <>
      <div className="stl-page stl-single-type-page sab-stage-page">
        <StandardArticleStageHero
          stagedArticle={stagedArticle}
          eyebrow={heroEyebrow}
          description={heroDescription}
          backLabel={backToStageLabel}
          stagePath={layout.stagePath}
          completionPercent={derived.completionPercent}
          isSynced={derived.isSynced}
          onDelete={layout.onDelete}
        />

        <div className="stl-builder-layout">
          <main className="stl-builder-main">
            <StandardArticleStatusBanners
              status={status}
              localError={localError}
              localResult={localResult}
              hasUnsyncedPayloadChanges={derived.hasUnsyncedPayloadChanges}
              isPublished={derived.isPublished}
              isPublishing={sidebarProps.isPublishing}
              syncIssues={derived.syncIssues}
              onSubmit={actions.submitToPayload}
            />

            <StandardArticleSetupPanel
              stagedArticle={stagedArticle}
              locations={sidebarProps.locations}
              sharedNeighborhoodOptions={derived.sharedNeighborhoodOptions}
              selectedSharedNeighborhoods={derived.selectedSharedNeighborhoods}
              isCityPrimaryLocation={derived.selectedLocation?.level === 'city'}
              isSynced={derived.isSynced}
              isStep1Locked={derived.isStep1Locked}
              isGeneratingSlug={permalink.isGeneratingSlug}
              onUpdateTitle={layout.onUpdateTitle}
              onUpdateArticle={actions.setStageArticle}
              onContinue={actions.continueSetup}
              onGenerateSlug={generateSlug}
            />

            {(derived.isStep1Locked || derived.isSynced) ? (
              <StandardArticleFeaturedImagePanel
                stagedArticle={stagedArticle}
                isSynced={derived.isSynced}
                isStep2Locked={derived.isStep2Locked}
                featuredImagePreviewUrl={featuredImagePreviewUrl}
                featuredImageTriggerLabel={featuredImageTriggerLabel}
                onUpdateArticle={actions.setStageArticle}
                onContinue={actions.continueFeaturedImage}
                onOpenFeaturedImageModal={sidebarProps.onOpenFeaturedImageModal}
              />
            ) : null}

            {(derived.isStep1Locked || derived.isSynced) ? (
              <StandardArticleContentPanel
                stagedArticle={stagedArticle}
                timelineListProps={timelineListProps}
                isSynced={derived.isSynced}
                isStep3Locked={derived.isStep3Locked}
                onUpdateArticle={actions.setStageArticle}
                onContinue={actions.continueContent}
                onResetToOriginalBlocks={layout.onResetToOriginalBlocks}
                onOpenDeepExpand={expansion.open}
              />
            ) : null}

            {((derived.isStep1Locked && derived.isStep3Locked) || derived.isSynced) ? (
              <SeoEditorPanel
                seoSection={derived.seoSection}
                setSeoSection={updateSeoSection}
                onGenerateSeoWithAi={seo.generateSeo}
                isGeneratingSeoTarget={seo.isGeneratingSeoTarget}
                onGenerateSeoImageFromFeatured={seo.generateImageFromFeatured}
                isGeneratingSeoImage={seo.isGeneratingSeoImage}
                onUploadOgImageFile={seo.uploadOgImageFile}
                isUploadingOgImage={seo.isUploadingOgImage}
                onAutoFillOgUrl={permalink.autoFillOgUrl}
                onRegenerateStructuredData={structuredData.regenerateFromTemplate}
                canRegenerateStructuredData={structuredData.canRegenerateFromTemplate}
                title="SEO & Sync"
              />
            ) : null}
          </main>

          <StandardArticleBuilderSidebar
            stagedArticle={stagedArticle}
            sidebarProps={sidebarProps}
            selectedLocationLabel={derived.selectedLocationLabel}
            syncIssues={derived.syncIssues}
            completionPercent={derived.completionPercent}
            isSynced={derived.isSynced}
            isPublished={derived.isPublished}
            isStep1Locked={derived.isStep1Locked}
            isStep2Locked={derived.isStep2Locked}
            isStep3Locked={derived.isStep3Locked}
            seoCoreComplete={derived.seoCoreComplete}
            canManagePublished={canManagePublished}
            role={role}
            onSubmit={actions.submitToPayload}
          />
        </div>
      </div>

      <FeaturedImageModal {...featuredModalProps} />
      <BlockImageModal {...blockModalProps} />
      <ArticleExpansionModal
        isOpen={expansion.isOpen}
        phase={expansion.phase}
        expandedArticle={expansion.expandedArticle}
        expansionPlan={expansion.expansionPlan}
        error={expansion.error}
        originalArticle={stagedArticle.content}
        articleType={stagedArticle.originalType}
        title={stagedArticle.title || stagedArticle.originalTitle}
        listicleDetection={expansion.listicleDetection}
        onAccept={expansion.accept}
        onClose={expansion.close}
        onProceed={expansion.proceedWithExpansion}
      />
    </>
  )
}
