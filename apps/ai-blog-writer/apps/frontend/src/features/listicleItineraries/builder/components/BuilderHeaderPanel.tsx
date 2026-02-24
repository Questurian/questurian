import { MarkdownBlockEditor } from '../../../staging/features/markdown-editor'
import type { ListicleItineraryDraft } from '../../types'

type BuilderHeaderPanelProps = {
  draft: ListicleItineraryDraft
  mediaAssets: Array<{ id: number; filename: string }>
  updateHeader: (next: Partial<ListicleItineraryDraft['header']>) => void
}

export function BuilderHeaderPanel({ draft, mediaAssets, updateHeader }: BuilderHeaderPanelProps) {
  return (
    <section className="stl-panel">
      <div className="stl-panel-header">
        <h2>
          <span className="stl-kicker">Step 2</span> Header
        </h2>
      </div>
      <div className="stl-grid stl-grid-2">
        <label className="stl-field">
          <span>Custom Title</span>
          <input value={draft.header.customTitle} onChange={(event) => updateHeader({ customTitle: event.target.value })} />
        </label>

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
      </div>

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
    </section>
  )
}
