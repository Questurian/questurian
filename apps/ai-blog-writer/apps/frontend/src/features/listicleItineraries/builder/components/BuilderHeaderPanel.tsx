import { BuilderHeaderPanel as SharedBuilderHeaderPanel } from '../../../../shared/builder/components/BuilderHeaderPanel'
import type { ListicleItineraryDraft, MediaAssetOption } from '../../types'

type BuilderHeaderPanelProps = {
  draft: ListicleItineraryDraft
  token: string | null
  locationRef: number | null
  mediaAssets: MediaAssetOption[]
  updateHeader: (next: Partial<ListicleItineraryDraft['header']>) => void
  onIntroAiAutoWrite: () => Promise<void>
  isIntroAiGenerating: boolean
  isLocked: boolean
  isSynced?: boolean
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
  onIntroAiAutoWrite,
  isIntroAiGenerating,
  isLocked,
  isSynced = false,
  onContinueStep2,
  onUpdateStep2,
  onSaveStep2,
  onCancelStep2Update,
}: BuilderHeaderPanelProps) {
  return (
    <SharedBuilderHeaderPanel
      draft={draft}
      token={token}
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
      renderIntroAiActions={() => (
        <button
          type="button"
          className="stl-btn stl-btn-secondary"
          onClick={() => void onIntroAiAutoWrite()}
          disabled={isIntroAiGenerating}
        >
          {isIntroAiGenerating
            ? 'Writing...'
            : draft.header.introMarkdown.trim()
              ? 'Regenerate'
              : 'Auto Write'}
        </button>
      )}
    />
  )
}
