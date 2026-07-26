import { ImageUpload } from '../components/ImageUpload'
import type { UploadImageResponse } from '../api/contracts/image-api.contracts'

type UploadImagePanelProps = {
  locationRef: number | null
  token?: string
  uploadIdentity: { externalRef: string; fileNamePrefix: string }
  onComplete: (response: UploadImageResponse) => void
  onCancel: () => void
}

export function UploadImagePanel({
  locationRef,
  token,
  uploadIdentity,
  onComplete,
  onCancel,
}: UploadImagePanelProps) {
  return (
    <div className="ip-upload-pane">
      {locationRef === null ? (
        <p className="ip-notice">
          A location must be set before you can upload images.
        </p>
      ) : (
        <ImageUpload
          className="ip-upload-flow"
          externalRef={uploadIdentity.externalRef}
          fileNamePrefix={uploadIdentity.fileNamePrefix}
          locationRef={locationRef}
          token={token ?? ''}
          onComplete={onComplete}
          onCancel={onCancel}
        />
      )}
    </div>
  )
}
