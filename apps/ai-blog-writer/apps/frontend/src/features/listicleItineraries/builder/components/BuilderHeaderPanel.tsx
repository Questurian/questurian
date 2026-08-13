import { useState } from 'react'
import { BuilderHeaderPanel as SharedBuilderHeaderPanel } from '../../../../shared/builder/components/BuilderHeaderPanel'
import { FieldInfoHint } from '../../../../shared/builder/components/FieldInfoHint'
import { CompositeImageModal } from '../../../../shared/images/components/CompositeImageModal'
import type { ListicleItineraryDraft, MediaAssetOption } from '../../types'

type BuilderHeaderPanelProps = {
  draft: ListicleItineraryDraft
  locationRef: number | null
  mediaAssets: MediaAssetOption[]
  updateHeader: (next: Partial<ListicleItineraryDraft['header']>) => void
  onIntroAiAutoWrite: () => Promise<void>
  isIntroAiGenerating: boolean
  /** When set, the compose button is disabled and shows this as a tooltip. */
  introComposeDisabledReason?: string
  /** True once a Compose-from-plan run has been captured this session. */
  hasIntroComposeReport?: boolean
  onViewIntroComposeReport?: () => void
  isLocked: boolean
  isSynced?: boolean
  onContinueStep2: () => void
  onUpdateStep2: () => void
  onSaveStep2: () => void
  onCancelStep2Update: () => void
}

export function BuilderHeaderPanel({
  draft,
  locationRef,
  mediaAssets,
  updateHeader,
  onIntroAiAutoWrite,
  isIntroAiGenerating,
  introComposeDisabledReason,
  hasIntroComposeReport = false,
  onViewIntroComposeReport,
  isLocked,
  isSynced = false,
  onContinueStep2,
  onUpdateStep2,
  onSaveStep2,
  onCancelStep2Update,
}: BuilderHeaderPanelProps) {
  const [compositeOpen, setCompositeOpen] = useState(false)

  return (
    <>
      <SharedBuilderHeaderPanel
        draft={draft}
        locationRef={locationRef}
        mediaAssets={mediaAssets}
        updateHeader={updateHeader}
        isLocked={isLocked}
        isSynced={isSynced}
        onContinueStep2={onContinueStep2}
        onUpdateStep2={onUpdateStep2}
        onSaveStep2={onSaveStep2}
        onCancelStep2Update={onCancelStep2Update}
        headerPreviewTitleFallback="Your itinerary headline will appear here"
        introPlaceholder="Write the itinerary intro..."
        renderFeaturedImageActions={() => (
          <button
            type="button"
            className="stl-btn stl-btn-secondary"
            onClick={() => setCompositeOpen(true)}
          >
            Create composite
          </button>
        )}
        renderIntroAiActions={() => (
          <>
            <FieldInfoHint text={'Writes the intro from your AI plan overview, the picks, and each “Why this pick” — plus the title, location, and list tone.'} />
            <button
              type="button"
              className="stl-btn stl-btn-secondary"
              onClick={() => void onIntroAiAutoWrite()}
              disabled={isIntroAiGenerating || Boolean(introComposeDisabledReason)}
              title={introComposeDisabledReason}
            >
              {isIntroAiGenerating
                ? 'Composing...'
                : draft.header.introMarkdown.trim()
                  ? 'Recompose from plan'
                  : 'Compose from plan'}
            </button>
            {hasIntroComposeReport && onViewIntroComposeReport ? (
              <button
                type="button"
                className="stl-btn stl-btn-secondary"
                onClick={onViewIntroComposeReport}
              >
                Inspect run
              </button>
            ) : null}
          </>
        )}
      />
      {(
        <CompositeImageModal
          isOpen={compositeOpen}
          locationRef={locationRef}
          defaultTitle={`Composite: ${draft.title.trim() || 'Itinerary header'}`}
          onCreated={(response) => {
            const mediaSetId = Number(response.mediaSetId)
            if (!Number.isNaN(mediaSetId)) {
              updateHeader({ featuredMediaSet: mediaSetId, featuredImage: null })
            }
          }}
          onClose={() => setCompositeOpen(false)}
        />
      )}
    </>
  )
}
