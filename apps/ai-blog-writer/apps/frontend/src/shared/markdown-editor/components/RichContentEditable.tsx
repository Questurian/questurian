import type {
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import type { MutableRefObject } from 'react'

type RichContentEditableProps = {
  editorRef: MutableRefObject<HTMLDivElement | null>
  isEditorEmpty: boolean
  placeholder: string
  ariaLabel?: string
  onInput: () => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
  onPaste: (event: ReactClipboardEvent<HTMLDivElement>) => void
}

export function RichContentEditable({
  editorRef,
  isEditorEmpty,
  placeholder,
  ariaLabel,
  onInput,
  onKeyDown,
  onPaste,
}: RichContentEditableProps) {
  return (
    <div
      ref={editorRef}
      className={`block-rich-editor ${isEditorEmpty ? 'is-empty' : ''}`}
      contentEditable
      role="textbox"
      aria-label={ariaLabel ?? 'Block content'}
      aria-multiline="true"
      /* Long-form prose: misspellings are worth flagging. autoCorrect and
         autoCapitalize stay off — they fight the author over proper nouns. */
      spellCheck
      autoCorrect="off"
      autoCapitalize="off"
      suppressContentEditableWarning
      data-placeholder={placeholder || 'Write your content...'}
      /* Grammarly injects its own nodes into the contenteditable, which the
         markdown serializer would walk and write back into the document. */
      data-gramm="false"
      data-gramm_editor="false"
      data-enable-grammarly="false"
      onInput={onInput}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
    />
  )
}
