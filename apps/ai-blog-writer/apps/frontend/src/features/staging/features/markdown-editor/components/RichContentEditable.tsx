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
  const normalizeInlineTypingState = () => {
    const selection = window.getSelection()
    if (!selection || !selection.isCollapsed) return

    try {
      if (document.queryCommandState('bold')) {
        document.execCommand('bold')
      }
      if (document.queryCommandState('italic')) {
        document.execCommand('italic')
      }
    } catch {
      // Some browsers can throw for queryCommandState; ignore safely.
    }
  }

  return (
    <div
      ref={editorRef}
      className={`block-rich-editor ${isEditorEmpty ? 'is-empty' : ''}`}
      contentEditable
      role="textbox"
      aria-multiline="true"
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      suppressContentEditableWarning
      data-placeholder={placeholder || 'Write your content...'}
      data-gramm="false"
      data-gramm_editor="false"
      data-enable-grammarly="false"
      onInput={onInput}
      onKeyDown={onKeyDown}
      onFocus={normalizeInlineTypingState}
      onMouseUp={normalizeInlineTypingState}
    />
  )
}
