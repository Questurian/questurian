import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { markdownToEditorHtml } from '../richMarkdown'
import { resizeTextareaToContent } from '../utils/editor-dom.utils'

type UseMarkdownEditorStateParams = {
  blockId: string
  value: string
  showToolbar: boolean
  onChange: (nextValue: string) => void
  onResetTransient: () => void
}

type UseMarkdownEditorStateResult = {
  isRichEditor: boolean
  editorRef: MutableRefObject<HTMLDivElement | null>
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>
  draftMarkdownRef: MutableRefObject<string>
  isEditorEmpty: boolean
  setIsEditorEmpty: Dispatch<SetStateAction<boolean>>
  setPlainTextareaRef: (element: HTMLTextAreaElement | null) => void
  commitMarkdown: (nextMarkdown: string) => void
}

export function useMarkdownEditorState({
  blockId,
  value,
  showToolbar,
  onChange,
  onResetTransient,
}: UseMarkdownEditorStateParams): UseMarkdownEditorStateResult {
  const isRichEditor = showToolbar
  const editorRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const draftMarkdownRef = useRef<string>(value)
  const previousBlockIdRef = useRef<string>('')
  const [isEditorEmpty, setIsEditorEmpty] = useState<boolean>(value.trim().length === 0)

  useEffect(() => {
    const blockChanged = previousBlockIdRef.current !== blockId
    previousBlockIdRef.current = blockId

    if (!blockChanged && value === draftMarkdownRef.current) return

    draftMarkdownRef.current = value
    setIsEditorEmpty(value.trim().length === 0)
    onResetTransient()

    if (isRichEditor) {
      const editor = editorRef.current
      if (editor) {
        editor.innerHTML = markdownToEditorHtml(value)
      }
      return
    }

    const textarea = textareaRef.current
    if (textarea) {
      textarea.value = value
      resizeTextareaToContent(textarea)
    }
  }, [blockId, isRichEditor, onResetTransient, value])

  const commitMarkdown = useCallback(
    (nextMarkdown: string) => {
      draftMarkdownRef.current = nextMarkdown
      setIsEditorEmpty(nextMarkdown.trim().length === 0)
      onChange(nextMarkdown)
    },
    [onChange],
  )

  const setPlainTextareaRef = useCallback((element: HTMLTextAreaElement | null) => {
    textareaRef.current = element
    if (element) {
      resizeTextareaToContent(element)
    }
  }, [])

  return {
    isRichEditor,
    editorRef,
    textareaRef,
    draftMarkdownRef,
    isEditorEmpty,
    setIsEditorEmpty,
    setPlainTextareaRef,
    commitMarkdown,
  }
}
