import { MarkdownBlockEditor } from '../../../staging/features/markdown-editor'
import type { ListicleItineraryDraft } from '../../types'

type AiRewriteInput = {
  blockId: string
  currentContent: string
  prompt: string
  includeWholeArticleContext: boolean
}

type BuilderHeaderPanelProps = {
  draft: ListicleItineraryDraft
  mediaAssets: Array<{ id: number; filename: string }>
  updateHeader: (next: Partial<ListicleItineraryDraft['header']>) => void
  onIntroAiRewrite: (input: AiRewriteInput) => Promise<string>
  isLocked: boolean
  onContinueStep2: () => void
  onUpdateStep2: () => void
  onSaveStep2: () => void
  onCancelStep2Update: () => void
}

export function BuilderHeaderPanel({
  draft,
  mediaAssets,
  updateHeader,
  onIntroAiRewrite,
  isLocked,
  onContinueStep2,
  onUpdateStep2,
  onSaveStep2,
  onCancelStep2Update,
}: BuilderHeaderPanelProps) {
  return (
    <section className="stl-panel">
      <div className="stl-panel-header">
        <h2>
          <span className="stl-kicker">Step 2</span> Header
        </h2>
        <div className="stl-inline-actions">
          {!draft.step2_complete ? (
            <button type="button" className="stl-btn" onClick={onContinueStep2}>
              Continue
            </button>
          ) : null}
          {draft.step2_complete && !draft.step2_in_update_mode ? (
            <button type="button" className="stl-btn stl-btn-secondary" onClick={onUpdateStep2}>
              Update Header
            </button>
          ) : null}
          {draft.step2_in_update_mode ? (
            <>
              <button type="button" className="stl-btn" onClick={onSaveStep2}>
                Save Header
              </button>
              <button type="button" className="stl-btn stl-btn-secondary" onClick={onCancelStep2Update}>
                Cancel
              </button>
            </>
          ) : null}
        </div>
      </div>

      <fieldset className="stl-panel-fieldset" disabled={isLocked}>
        <label className="stl-field">
          <span>Featured Image</span>
          <select
            value={draft.header.featuredImage || ''}
            onChange={(event) =>
              updateHeader({
                featuredImage: event.target.value ? Number(event.target.value) : null,
              })
            }
          >
            <option value="">None</option>
            {mediaAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                #{asset.id} {asset.filename}
              </option>
            ))}
          </select>
        </label>

        <label className="stl-field">
          <span>Intro *</span>
          <MarkdownBlockEditor
            blockId={`${draft.draftId}_header_intro`}
            value={draft.header.introMarkdown}
            onChange={(nextValue) =>
              updateHeader({
                introMarkdown: nextValue,
                introJsonText: '',
              })
            }
            showToolbar
            enforceHeadingStructure={false}
            onAiRewrite={onIntroAiRewrite}
            placeholder="Write the itinerary intro..."
            className="stl-markdown-textarea"
            rows={6}
          />
        </label>
        {!draft.header.introMarkdown.trim() && draft.header.introJsonText?.trim() ? (
          <p className="stl-legacy-note">
            Existing intro is stored in Payload as Lexical JSON. Editing here will replace it with markdown-converted content.
          </p>
        ) : null}
      </fieldset>
    </section>
  )
}
