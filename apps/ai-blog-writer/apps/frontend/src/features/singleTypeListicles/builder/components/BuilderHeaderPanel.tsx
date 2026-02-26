import { useState } from 'react'
import { FeaturedImagePicker } from '../../../../components/FeaturedImagePicker'
import { AiTitleInput, MarkdownBlockEditor } from '../../../staging/features/markdown-editor'
import type { AiTitleGenerateInput } from '../../../staging/features/markdown-editor'
import type { SingleTypeListicleDraft } from '../../types'

type AiRewriteInput = {
  blockId: string
  currentContent: string
  prompt: string
  includeWholeArticleContext: boolean
}

type BuilderHeaderPanelProps = {
  draft: SingleTypeListicleDraft
  token: string | null
  locationRef: number | null
  updateHeader: (next: Partial<SingleTypeListicleDraft['header']>) => void
  onIntroAiRewrite: (input: AiRewriteInput) => Promise<string>
  onTitleAiGenerate?: (input: AiTitleGenerateInput) => Promise<string>
}

function getAiTitleDisabledReason(draft: SingleTypeListicleDraft): string | undefined {
  if (!draft.location && !draft.listicleType) return 'Set a location and data type in Step 1 first'
  if (!draft.location) return 'Set a location in Step 1 first'
  if (!draft.listicleType) return 'Set a data type in Step 1 first'
  if (!draft.header.customTitle.trim()) return 'Write a title first, then AI can improve it'
  return undefined
}

export function BuilderHeaderPanel({
  draft,
  token,
  locationRef,
  updateHeader,
  onIntroAiRewrite,
  onTitleAiGenerate,
}: BuilderHeaderPanelProps) {
  const resolvedToken = token ?? ''
  const [pickerOpen, setPickerOpen] = useState(false)
  const aiTitleDisabledReason = getAiTitleDisabledReason(draft)

  const featuredImageId = draft.header.featuredImage
  const triggerLabel = featuredImageId ? `Image #${featuredImageId} selected` : 'Select Featured Image...'
  const isPlaceholder = !featuredImageId

  return (
    <section className="stl-panel">
      <div className="stl-panel-header">
        <h2>
          <span className="stl-kicker">Step 2</span> Header
        </h2>
      </div>
      <div className="stl-grid stl-grid-2">
        <div className="stl-field">
          <div className="stl-field-label-row">
            <span>Custom Title</span>
            {onTitleAiGenerate && (
              <AiTitleInput
                currentTitle={draft.header.customTitle}
                onGenerate={onTitleAiGenerate}
                onApply={(title) => updateHeader({ customTitle: title })}
                disabledReason={aiTitleDisabledReason}
              />
            )}
          </div>
          <input value={draft.header.customTitle} onChange={(event) => updateHeader({ customTitle: event.target.value })} />
        </div>

        <div className="stl-field">
          <span>Featured Image</span>
          <button
            type="button"
            className="stl-picker-trigger"
            onClick={() => setPickerOpen(true)}
          >
            <span className="stl-picker-trigger__preview">
              <span className={`stl-picker-trigger__label${isPlaceholder ? ' stl-picker-trigger__label--placeholder' : ''}`}>
                {triggerLabel}
              </span>
            </span>
            <span className="stl-picker-trigger__caret">▼</span>
          </button>
          {featuredImageId && (
            <button
              type="button"
              className="stl-btn stl-btn-secondary"
              style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem', marginTop: '0.25rem', alignSelf: 'flex-start' }}
              onClick={() => updateHeader({ featuredImage: null })}
            >
              Clear
            </button>
          )}
        </div>
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
          onAiRewrite={onIntroAiRewrite}
          placeholder="Write the listicle intro..."
          className="stl-markdown-textarea"
          rows={6}
        />
      </label>
      {!draft.header.introMarkdown.trim() && draft.header.introJsonText?.trim() ? (
        <p className="stl-legacy-note">
          Existing intro is stored in Payload as Lexical JSON. Editing here will replace it with markdown-converted content.
        </p>
      ) : null}

      <FeaturedImagePicker
        isOpen={pickerOpen}
        selectedId={featuredImageId}
        token={resolvedToken}
        locationRef={locationRef}
        onSelect={(id) => updateHeader({ featuredImage: id })}
        onClose={() => setPickerOpen(false)}
      />
    </section>
  )
}
