import type { Location, MediaAsset } from '../../api'
import type { StagedArticle } from '../../types'
import { usePermissions } from '../../../auth'
import { isStagedArticleEditingLocked } from '../../utils/staged-article-sync'
import { EditorialArticleSettings } from './editorial-sidebar/EditorialArticleSettings'
import { EditorialFeaturedImageSection } from './editorial-sidebar/EditorialFeaturedImageSection'
import { EditorialLocationSection } from './editorial-sidebar/EditorialLocationSection'
import { EditorialPublishingSection } from './editorial-sidebar/EditorialPublishingSection'
import { getEditorialSidebarPublishingState } from './editorial-sidebar/editorial-sidebar-publishing-state'

type PublishResult = { success: boolean; message: string } | null

type EditorialSidebarProps = {
  stagedArticle: StagedArticle
  isPublishing: boolean
  allFieldsFilled: boolean
  missingPublishFields: string[]
  editorialBlockingMessages: string[]
  publishResult: PublishResult
  featuredImageRequirementLabel: string
  selectedFeaturedImage: MediaAsset | null
  getImageUrl: (asset: MediaAsset) => string
  onOpenFeaturedImageModal: () => void
  locations: Location[]
  onUpdateStagedArticle: (updates: Partial<StagedArticle>) => void
  onPublish: (targetStatus: 'draft' | 'published') => void
  onDeepExpand?: () => void
}

export function EditorialSidebar({
  stagedArticle,
  isPublishing,
  allFieldsFilled,
  missingPublishFields,
  editorialBlockingMessages,
  publishResult,
  featuredImageRequirementLabel,
  selectedFeaturedImage,
  getImageUrl,
  onOpenFeaturedImageModal,
  locations,
  onUpdateStagedArticle,
  onPublish,
  onDeepExpand,
}: EditorialSidebarProps) {
  const { canManagePublished, role } = usePermissions()
  const isEditingLocked = isStagedArticleEditingLocked(stagedArticle)
  const publishingState = getEditorialSidebarPublishingState({
    stagedArticle,
    allFieldsFilled,
    missingPublishFields,
    editorialBlockingMessages,
    locations,
    isEditingLocked,
  })

  return (
    <aside className="stage-article-sidebar">
      <div className="stage-article-sidebar-inner">
        <EditorialPublishingSection
          state={publishingState}
          isPublishing={isPublishing}
          allFieldsFilled={allFieldsFilled}
          missingPublishFields={missingPublishFields}
          editorialBlockingMessages={editorialBlockingMessages}
          publishResult={publishResult}
          canManagePublished={canManagePublished}
          role={role}
          onPublish={onPublish}
        />
        <EditorialFeaturedImageSection
          stagedArticle={stagedArticle}
          requirementLabel={featuredImageRequirementLabel}
          selectedImage={selectedFeaturedImage}
          isEditingLocked={isEditingLocked}
          getImageUrl={getImageUrl}
          onOpenModal={onOpenFeaturedImageModal}
        />
        <EditorialLocationSection
          stagedArticle={stagedArticle}
          locations={locations}
          isEditingLocked={isEditingLocked}
          onUpdate={onUpdateStagedArticle}
        />
        <EditorialArticleSettings
          stagedArticle={stagedArticle}
          isEditingLocked={isEditingLocked}
          onUpdate={onUpdateStagedArticle}
          onDeepExpand={onDeepExpand}
        />
      </div>
    </aside>
  )
}
