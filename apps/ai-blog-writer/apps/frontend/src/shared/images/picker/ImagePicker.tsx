import { createPortal } from 'react-dom'
import type { PexelsPhoto, UnsplashPhoto } from '../external/external-images.types'
import {
  getPexelsPhotoImportUrl,
  getUnsplashPhotoImportUrl,
} from '../external/external-import.utils'
import { ExternalImagePanel } from './ExternalImagePanel'
import { ImagePickerChrome } from './ImagePickerChrome'
import { PayloadImagePanel } from './PayloadImagePanel'
import { UploadImagePanel } from './UploadImagePanel'
import type { ImagePickerProps } from './imagePicker.types'
import { useImagePickerController } from './useImagePickerController'
import { useImagePickerModalLifecycle } from './useImagePickerModalLifecycle'
import './imagePicker.css'

export type { ImagePickerProps } from './imagePicker.types'

export function ImagePicker(props: ImagePickerProps) {
  const {
    isOpen,
    token,
    locationRef,
    query,
    selection = { mode: 'single' },
    selectedId = null,
    aboveGrid,
    payloadOnly = false,
    confirmLabel = 'Add selected',
    onClose,
  } = props
  const controller = useImagePickerController({
    ...props,
    selection,
    selectedId,
    payloadOnly,
    confirmLabel,
  })
  const modal = useImagePickerModalLifecycle(isOpen, onClose)

  if (!isOpen) return null

  return createPortal(
    <div
      className="ip-overlay"
      ref={modal.overlayRef}
      onClick={modal.handleOverlayClick}
      role="presentation"
    >
      <ImagePickerChrome
        activeTab={controller.activeTab}
        payloadOnly={payloadOnly}
        uploadAvailable={controller.uploadAvailable}
        locationRef={locationRef}
        query={query}
        onTabChange={controller.switchTab}
        onClose={onClose}
      >
        {controller.activeTab === 'payload' && (
          <PayloadImagePanel
            aboveGrid={aboveGrid}
            query={query}
            search={controller.search}
            data={controller.data}
            selectedId={selectedId}
            bufferIds={
              controller.isMulti ? controller.buffer.bufferIds : null
            }
            requiredCount={controller.requiredCount}
            confirmLabel={confirmLabel}
            onSearchChange={controller.setSearch}
            onAssetClick={controller.handlePayloadAssetClick}
            onMediaSetClick={controller.handleMediaSetClick}
            onConfirmMulti={controller.handleConfirmMulti}
          />
        )}

        {controller.activeTab === 'upload' && (
          <UploadImagePanel
            locationRef={locationRef}
            token={token}
            uploadIdentity={controller.uploadIdentity}
            onComplete={controller.handleUploadComplete}
            onCancel={() => controller.switchTab('payload')}
          />
        )}

        {controller.activeTab === 'unsplash' && (
          <ExternalImagePanel
            provider="unsplash"
            controller={controller.unsplash}
            importUrl={(photo) =>
              getUnsplashPhotoImportUrl(photo as UnsplashPhoto)
            }
            importer={controller.importer}
            locationRef={locationRef}
            isMulti={controller.isMulti}
            bufferIds={controller.buffer.bufferIds}
            requiredCount={controller.requiredCount}
            confirmLabel={confirmLabel}
            onConfirmMulti={controller.handleConfirmMulti}
            onCropConfirm={(variantFiles) => {
              void controller.handleExternalCropConfirm(variantFiles)
            }}
          />
        )}

        {controller.activeTab === 'pexels' && (
          <ExternalImagePanel
            provider="pexels"
            controller={controller.pexels}
            importUrl={(photo) => getPexelsPhotoImportUrl(photo as PexelsPhoto)}
            importer={controller.importer}
            locationRef={locationRef}
            isMulti={controller.isMulti}
            bufferIds={controller.buffer.bufferIds}
            requiredCount={controller.requiredCount}
            confirmLabel={confirmLabel}
            onConfirmMulti={controller.handleConfirmMulti}
            onCropConfirm={(variantFiles) => {
              void controller.handleExternalCropConfirm(variantFiles)
            }}
          />
        )}
      </ImagePickerChrome>
    </div>,
    document.body,
  )
}
