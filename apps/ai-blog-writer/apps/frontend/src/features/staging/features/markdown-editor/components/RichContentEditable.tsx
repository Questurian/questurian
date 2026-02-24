import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { MutableRefObject } from 'react'

type RichContentEditableProps = {
  editorRef: MutableRefObject<HTMLDivElement | null>
  isEditorEmpty: boolean
  placeholder: string
  onInput: () => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
}

export function RichContentEditable({
  editorRef,
  isEditorEmpty,
  placeholder,
  onInput,
  onKeyDown,
}: RichContentEditableProps) {
  return (
    <div
      ref={editorRef}
      className={`block-rich-editor ${isEditorEmpty ? 'is-empty' : ''}`}
      contentEditable
      role="textbox"
      aria-multiline="true"
      suppressContentEditableWarning
      data-placeholder={placeholder || 'Write your content...'}
      onInput={onInput}
      onKeyDown={onKeyDown}
    />
  )
}
