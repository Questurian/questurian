import type { Dispatch, SetStateAction } from 'react'
import type {
  InstagramPostOption,
  ListicleItemBlock,
  RelatedItemOption
} from '../../../types'
import {
  getRelatedInstagramPostObjects,
  getRelatedPhotoObjects
} from '../../../../../shared/builder/utils/item-media.utils'
import { InstagramPickerModal } from '../../../../../shared/builder/components/InstagramPickerModal'
import { PhotoPickerModal } from '../../../../../shared/builder/components/PhotoPickerModal'
import { RelatedItemPickerModal } from '../../../../../shared/builder/components/RelatedItemPickerModal'
import { getAvailableMediaModeOptions } from './itemMedia.utils'
import type { ActivePicker } from './item.types'

type Props = {
  item: ListicleItemBlock
  index: number
  relatedItems: RelatedItemOption[]
  photoObjects: ReturnType<typeof getRelatedPhotoObjects>
  instagramPostObjects: InstagramPostOption[]
  selectedInstagramPost: InstagramPostOption | null
  selectedInstagramEmbedUrl?: string
  selectedInstagramPreviewUrl?: string
  activePicker: ActivePicker
  setActivePicker: Dispatch<SetStateAction<ActivePicker>>
  activeInstagramEmbedPreviewItemId: string | null
  setActiveInstagramEmbedPreviewItemId: Dispatch<SetStateAction<string | null>>
  updateItem: (
    itemId: string,
    updater: (item: ListicleItemBlock) => ListicleItemBlock
  ) => void
}

export function BuilderItemOverlays({
  item,
  index,
  relatedItems,
  photoObjects,
  instagramPostObjects,
  selectedInstagramPost,
  selectedInstagramEmbedUrl,
  selectedInstagramPreviewUrl,
  activePicker,
  setActivePicker,
  activeInstagramEmbedPreviewItemId,
  setActiveInstagramEmbedPreviewItemId,
  updateItem
}: Props) {
  const activeItemPicker = activePicker?.type === 'item' ? activePicker : null
  const activePhotoPicker =
    activePicker?.type === 'photos' ? activePicker : null
  const activeInstagramPicker =
    activePicker?.type === 'instagram' ? activePicker : null

  return (
    <>
      {/* Related item picker modal */}
      <RelatedItemPickerModal
        isOpen={activeItemPicker?.itemId === item.id}
        items={relatedItems}
        selectedItemId={item.item}
        onSelect={(nextId) =>
          updateItem(item.id, (current) => {
            const nextRelatedItem =
              relatedItems.find((entry) => entry.id === nextId) || null
            const nextHasPhotos =
              getRelatedPhotoObjects(nextRelatedItem).length > 0
            const nextHasInstagram =
              getRelatedInstagramPostObjects(nextRelatedItem).length > 0
            const nextAvailableModes = getAvailableMediaModeOptions(
              nextHasPhotos,
              nextHasInstagram
            )
            const nextMediaMode =
              nextAvailableModes.find(
                (option) => option.value === current.mediaMode
              )?.value ??
              nextAvailableModes[0]?.value ??
              current.mediaMode

            return {
              ...current,
              item: nextId,
              // Tour Picks belong to the previous attraction's linked list.
              tours: nextId === current.item ? current.tours : [],
              mediaMode: nextMediaMode,
              selectedPhotos: [],
              selectedInstagramPost: null
            }
          })
        }
        onClose={() => setActivePicker(null)}
      />

      {/* Photo picker modal */}
      <PhotoPickerModal
        isOpen={activePhotoPicker?.itemId === item.id}
        photoObjects={photoObjects}
        selectedPhotoIds={item.selectedPhotos}
        onConfirm={(ids) =>
          updateItem(item.id, (current) => ({
            ...current,
            selectedPhotos: ids
          }))
        }
        onClose={() => setActivePicker(null)}
      />

      {/* Instagram picker modal */}
      <InstagramPickerModal
        isOpen={activeInstagramPicker?.itemId === item.id}
        posts={instagramPostObjects}
        selectedPostId={item.selectedInstagramPost}
        onSelect={(nextId) =>
          updateItem(item.id, (current) => ({
            ...current,
            selectedInstagramPost: nextId
          }))
        }
        onClose={() => setActivePicker(null)}
      />

      {activeInstagramEmbedPreviewItemId === item.id ? (
        <div
          className="stl-modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setActiveInstagramEmbedPreviewItemId(null)
            }
          }}
        >
          <div
            className="stl-picker-modal stl-picker-modal--instagram-preview"
            role="dialog"
            aria-modal="true"
            aria-label="Instagram embed preview"
          >
            <div className="stl-picker-modal__header">
              <h3>
                {selectedInstagramPost?.title || 'Instagram Post Preview'}
              </h3>
              <button
                type="button"
                className="stl-picker-modal__close"
                onClick={() => setActiveInstagramEmbedPreviewItemId(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="stl-instagram-embed-modal__body">
              {selectedInstagramEmbedUrl ? (
                <div className="stl-instagram-embed-modal__frame-wrap">
                  <iframe
                    src={selectedInstagramEmbedUrl}
                    title={`Instagram post embed for item ${index + 1}`}
                    className="stl-instagram-embed-modal__frame"
                    loading="lazy"
                    allow="encrypted-media; fullscreen; picture-in-picture"
                  />
                </div>
              ) : selectedInstagramPreviewUrl ? (
                <div className="stl-instagram-embed-modal__image-wrap">
                  <img src={selectedInstagramPreviewUrl} alt="" />
                </div>
              ) : (
                <div className="stl-instagram-embed-modal__empty">
                  Preview unavailable for this post.
                </div>
              )}
            </div>

            <div className="stl-picker-modal__footer">
              <button
                type="button"
                className="stl-btn stl-btn-secondary"
                onClick={() => {
                  setActiveInstagramEmbedPreviewItemId(null)
                  setActivePicker({ type: 'instagram', itemId: item.id })
                }}
              >
                Change Instagram Post
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
