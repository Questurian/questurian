import type { ReactNode } from 'react'
import type { MediaAsset, MediaSet } from '../../api/payload/payload.types'
import type { ImagePickerQuery } from './imagePicker.types'
import type { ImagePickerData } from './useImagePickerData'
import { ImagePickerGrid } from './ImagePickerGrid'
import { MultiSelectFooter } from './ExternalImagePanel'

type PayloadImagePanelProps = {
  aboveGrid?: ReactNode
  query: ImagePickerQuery
  search: string
  data: ImagePickerData
  selectedId: number | null
  bufferIds: number[] | null
  requiredCount: number
  confirmLabel: string
  onSearchChange: (search: string) => void
  onAssetClick: (asset: MediaAsset) => void
  onMediaSetClick: (mediaSet: MediaSet) => void
  onConfirmMulti: () => void
}

export function PayloadImagePanel({
  aboveGrid,
  query,
  search,
  data,
  selectedId,
  bufferIds,
  requiredCount,
  confirmLabel,
  onSearchChange,
  onAssetClick,
  onMediaSetClick,
  onConfirmMulti,
}: PayloadImagePanelProps) {
  return (
    <>
      {aboveGrid && <div className="ip-above-grid">{aboveGrid}</div>}
      <div className="ip-search-row">
        <input
          type="text"
          className="ip-search-input"
          placeholder={
            query.browseUnit === 'mediaSets'
              ? 'Search by title, location, or alt text...'
              : 'Search by filename or alt text...'
          }
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>

      {data.error && <p className="ip-error">{data.error}</p>}
      {data.isBootstrapping ? (
        <p className="ip-empty">Loading image library...</p>
      ) : (
        <ImagePickerGrid
          data={data}
          browseUnit={query.browseUnit}
          selectedId={selectedId}
          bufferIds={bufferIds}
          onAssetClick={onAssetClick}
          onMediaSetClick={onMediaSetClick}
        />
      )}

      {bufferIds && (
        <MultiSelectFooter
          selectedCount={bufferIds.length}
          requiredCount={requiredCount}
          confirmLabel={confirmLabel}
          onConfirm={onConfirmMulti}
        />
      )}
    </>
  )
}
