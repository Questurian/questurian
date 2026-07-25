import { resizeTextareaToContent } from '../../../../shared/markdown-editor/utils/editor-dom.utils'

type RawEditorialBlockEditorProps = {
  markdown: string
  onChangeMarkdown: (nextMarkdown: string) => void
}

export function RawEditorialBlockEditor({
  markdown,
  onChangeMarkdown,
}: RawEditorialBlockEditorProps) {
  return (
    <div style={{ marginTop: '0.35rem' }}>
      <textarea
        value={markdown}
        onChange={(event) => onChangeMarkdown(event.target.value)}
        onInput={(event) => resizeTextareaToContent(event.currentTarget)}
        ref={(element) => {
          if (element) resizeTextareaToContent(element)
        }}
        rows={Math.max(8, markdown.split('\n').length + 1)}
        className="block-textarea"
        style={{ width: '100%' }}
      />
      <p style={{ marginTop: '0.35rem', fontSize: '0.76rem', opacity: 0.72 }}>
        Unsupported block type. Edit markdown directly.
      </p>
    </div>
  )
}
