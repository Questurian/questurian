import type { LocationResponse } from "@client/shared/services/api/types";
import { AddInstagramEmbedForm } from "../forms/AddInstagramEmbedForm";
import { AddUploadFilesForm } from "../forms/AddUploadFilesForm";
import { MultiVariantCropperModal } from "../modals/MultiVariantCropperModal";
import { PayloadMediaSetSelector } from "../payload-selection/PayloadMediaSetSelector";
import { MAX_ATTRACTION_GALLERY_ITEMS } from "../payload-selection/usePayloadMediaSetSelection";
import { PhotoImportPanel } from "../PhotoImportPanel";
import { ImageLightbox } from "../ui/ImageLightbox";
import { GalleryDialogs } from "./GalleryDialogs";
import { InstagramEmbedsGallery } from "./InstagramEmbedsGallery";
import { PayloadMediaSetsGallery } from "./PayloadMediaSetsGallery";
import { REQUIRED_VARIANT_COUNT } from "./location-media-gallery.utils";
import { UploadedImageSetsGallery } from "./UploadedImageSetsGallery";
import { useLocationMediaGallery } from "./useLocationMediaGallery";
import { useInstagramApiQuota } from "@client/shared/services/api/hooks";

interface LocationMediaGalleryProps {
  locationDetail: LocationResponse;
}

export function LocationMediaGallery({ locationDetail }: LocationMediaGalleryProps) {
  const gallery = useLocationMediaGallery(locationDetail);
  const stagedSourceCount = (locationDetail.uploads || []).filter((upload) =>
    !!upload.stagedSourceStatus && (upload.imageSet?.variants?.length ?? 0) === 0
  ).length;
  const hasActiveInstagramStaging = (locationDetail.instagram_embeds || []).some((embed) =>
    embed.media_staging_status === "pending" || embed.media_staging_status === "processing"
  );
  const instagramQuota = useInstagramApiQuota(hasActiveInstagramStaging);
  return (
    <>
      {(gallery.uploadsWithPreview.length > 0 || stagedSourceCount > 0 || hasActiveInstagramStaging || !!locationDetail.placeId || gallery.isAttraction) && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {gallery.isAttraction ? `Gallery (${gallery.totalGalleryCount}/${MAX_ATTRACTION_GALLERY_ITEMS}):` : "Uploaded Images:"}
            </span>
            {gallery.isAttraction && <span className="text-xs text-muted-foreground">{gallery.uploadsWithPreview.length} uploaded{gallery.selectedMediaSets.length > 0 && ` + ${gallery.selectedMediaSets.length} from CMS`}</span>}
            {gallery.isAttraction && <div className="ml-auto"><PayloadMediaSetSelector selection={gallery.payloadSelection} /></div>}
          </div>
          {gallery.payloadSelection.saveError && <p className="ml-4 text-xs text-amber-600">{gallery.payloadSelection.saveError}</p>}
          {gallery.missingCreditCount > 0 && <p className="ml-4 text-xs font-medium text-amber-600">{gallery.missingCreditCount} image set{gallery.missingCreditCount === 1 ? "" : "s"} missing photographer credit</p>}
          {gallery.incompleteVariantCount > 0 && <p className="ml-4 text-xs font-medium text-amber-600">{gallery.incompleteVariantCount} image set{gallery.incompleteVariantCount === 1 ? "" : "s"} with fewer than {REQUIRED_VARIANT_COUNT} variants</p>}
          {gallery.totalGalleryCount === 0 && gallery.isAttraction && <p className="ml-4 text-xs text-muted-foreground">No images yet. Upload below or pick existing photos from Payload CMS.</p>}
          <PhotoImportPanel locationId={locationDetail.id} category={locationDetail.category} placeId={locationDetail.placeId ?? null} hasActiveInstagramStaging={hasActiveInstagramStaging} />
          <ul className="flex gap-2 ml-4 flex-wrap">
            <UploadedImageSetsGallery uploads={gallery.uploadsWithPreview} loadingSourceUploadId={gallery.loadingSourceUploadId} onOpen={gallery.openUpload} onDelete={(id) => gallery.setDeleteConfirm({ type: "upload", id })} />
            <PayloadMediaSetsGallery items={gallery.selectedMediaSets} uploadCount={gallery.uploadsWithPreview.length} isPending={gallery.payloadSelection.isPending} onRemove={gallery.payloadSelection.handleToggle} />
          </ul>
        </div>
      )}
      <InstagramEmbedsGallery embeds={gallery.instagramEmbedsWithPreview} onOpen={gallery.openInstagram} onDelete={(id) => gallery.setDeleteConfirm({ type: "instagram", id })} onRetry={(id) => gallery.retryInstagramStaging.mutate(id)} retrying={gallery.retryInstagramStaging.isPending} />
      <div className="flex gap-4">
        <div className="flex-1"><AddInstagramEmbedForm category={locationDetail.category} locationId={locationDetail.id} locationLabel={locationDetail.title || locationDetail.source?.name || ""} quota={instagramQuota.data} /></div>
        <div className="flex-1"><AddUploadFilesForm category={locationDetail.category} locationId={locationDetail.id} /></div>
      </div>
      <GalleryDialogs
        deleteType={gallery.deleteConfirm?.type}
        onCancelDelete={() => gallery.setDeleteConfirm(null)}
        onConfirmDelete={gallery.confirmDelete}
        editCreditState={gallery.editCreditState}
        onChangeCredit={(value) => gallery.setEditCreditState((state) => state ? { ...state, value, error: null } : state)}
        onCancelCredit={() => gallery.setEditCreditState(null)}
        onSaveCredit={gallery.savePhotographerCredit}
        isSavingCredit={gallery.updatePhotographerCreditMutation.isPending}
      />
      {gallery.manualCropState.isOpen && gallery.manualCropState.file && <MultiVariantCropperModal file={gallery.manualCropState.file} isOpen={gallery.manualCropState.isOpen} onClose={gallery.closeManualCrop} onConfirm={gallery.confirmManualCrop} />}
      {gallery.lightboxState.isOpen && (
        <ImageLightbox
          {...gallery.lightboxState}
          onClose={gallery.closeLightbox}
          onNext={gallery.nextLightboxImage}
          onPrevious={gallery.previousLightboxImage}
          showEditPhotographerCredit={Boolean(gallery.lightboxState.editableUploadId)}
          onEditPhotographerCredit={gallery.editCreditFromLightbox}
          onCopySuccess={(message, position) => gallery.showToast(message, position || { x: window.innerWidth / 2, y: window.innerHeight / 2 })}
        />
      )}
    </>
  );
}
