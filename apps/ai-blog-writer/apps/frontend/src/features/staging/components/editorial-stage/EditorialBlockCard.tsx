import {
  FAQ_COMPONENT,
  HIGHLIGHT_CALLOUT_COMPONENT,
  IN_THE_KNOW_COMPONENT,
  KEY_TAKEAWAYS_COMPONENT,
  PULL_QUOTE_COMPONENT,
} from '../../features/editorial-stage-article/constants'
import { normalizeEditorialComponentKey } from '../../features/editorial-stage-article/editorial-markdown.service'
import { EditorialBlockCardHeader } from './EditorialBlockCardHeader'
import { EditorialBlockPreview } from './EditorialBlockPreview'
import { EditorialBlockValidationNotice } from './EditorialBlockValidationNotice'
import type { EditorialBlockCardProps } from './editorial-block-card.types'
import { RawEditorialBlockEditor } from './RawEditorialBlockEditor'
import { StructuredEditorialBlockEditor } from './StructuredEditorialBlockEditor'

const STRUCTURED_COMPONENTS = new Set([
  KEY_TAKEAWAYS_COMPONENT,
  PULL_QUOTE_COMPONENT,
  IN_THE_KNOW_COMPONENT,
  HIGHLIGHT_CALLOUT_COMPONENT,
  FAQ_COMPONENT,
])

export function EditorialBlockCard({
  block,
  displayNumber,
  options,
}: EditorialBlockCardProps) {
  const normalizedComponent = normalizeEditorialComponentKey(block.component)
  const supportsStructuredEditor = STRUCTURED_COMPONENTS.has(normalizedComponent)
  const isEditMode = Boolean(options?.canEdit && options?.onChangeMarkdown)

  return (
    <article key={block.id} className={`block-card editorial-card ${isEditMode ? 'editing' : ''}`}>
      <EditorialBlockCardHeader
        block={block}
        displayNumber={displayNumber}
        options={options}
        isEditMode={isEditMode}
      />

      <div className="editorial-card-body">
        {isEditMode && (
          <EditorialBlockValidationNotice
            validation={options?.validation}
            onFixBlock={options?.onFixBlock}
            disableFix={options?.disableFix}
          />
        )}

        {isEditMode && options?.onChangeMarkdown ? (
          supportsStructuredEditor ? (
            <StructuredEditorialBlockEditor
              block={block}
              normalizedComponent={normalizedComponent}
              onChangeMarkdown={options.onChangeMarkdown}
            />
          ) : (
            <RawEditorialBlockEditor
              markdown={block.markdown}
              onChangeMarkdown={options.onChangeMarkdown}
            />
          )
        ) : (
          <EditorialBlockPreview
            block={block}
            normalizedComponent={normalizedComponent}
          />
        )}

        {isEditMode && (
          <details className="editorial-markdown-details">
            <summary>{supportsStructuredEditor ? 'Generated markdown' : 'Raw markdown'}</summary>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                marginTop: '0.5rem',
                fontSize: '0.78rem',
              }}
            >
              {block.markdown}
            </pre>
          </details>
        )}
      </div>
    </article>
  )
}
