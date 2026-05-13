import { useCallback, useState } from 'react'
import type { MutableRefObject } from 'react'
import { markdownToEditorHtml } from '../richMarkdown'
import { placeCaretAtEnd } from '../utils/editor-dom.utils'

type UseAiRewriteParams = {
  blockId: string
  onAiRewrite?: (input: {
    blockId: string
    currentContent: string
    prompt: string
    includeWholeArticleContext: boolean
  }) => Promise<string>
  draftMarkdownRef: MutableRefObject<string>
  editorRef: MutableRefObject<HTMLDivElement | null>
  applyValueWithHeadingGuard: (nextValue: string) => boolean
}

type UseAiRewriteResult = {
  isAiPromptOpen: boolean
  aiPromptDraft: string
  isAiRewriting: boolean
  aiRewriteError: string | null
  includeWholeArticleContext: boolean
  setIsAiPromptOpen: (value: boolean) => void
  setAiPromptDraft: (value: string) => void
  setAiRewriteError: (value: string | null) => void
  setIncludeWholeArticleContext: (value: boolean) => void
  openAiRewritePrompt: () => void
  runAiRewrite: () => Promise<void>
  resetAiUi: () => void
}

export function useAiRewrite({
  blockId,
  onAiRewrite,
  draftMarkdownRef,
  editorRef,
  applyValueWithHeadingGuard,
}: UseAiRewriteParams): UseAiRewriteResult {
  const [isAiPromptOpen, setIsAiPromptOpen] = useState(false)
  const [aiPromptDraft, setAiPromptDraft] = useState('')
  const [isAiRewriting, setIsAiRewriting] = useState(false)
  const [aiRewriteError, setAiRewriteError] = useState<string | null>(null)
  const [includeWholeArticleContext, setIncludeWholeArticleContext] = useState(false)

  const openAiRewritePrompt = useCallback(() => {
    if (!onAiRewrite) return
    setAiRewriteError(null)
    setIncludeWholeArticleContext(false)
    setIsAiPromptOpen(true)
  }, [onAiRewrite])

  const runAiRewrite = useCallback(async () => {
    if (!onAiRewrite) return

    const prompt = aiPromptDraft.trim()
    if (!prompt) {
      setAiRewriteError('Enter an instruction for AI first.')
      return
    }

    setIsAiRewriting(true)
    setAiRewriteError(null)

    try {
      const rewrittenContent = await onAiRewrite({
        blockId,
        currentContent: draftMarkdownRef.current,
        prompt,
        includeWholeArticleContext,
      })
      const nextMarkdown = rewrittenContent.trim()
      if (!nextMarkdown) {
        throw new Error('AI returned empty content.')
      }

      const didApply = applyValueWithHeadingGuard(nextMarkdown)
      if (!didApply) {
        setIsAiPromptOpen(false)
        return
      }

      const editor = editorRef.current
      if (editor) {
        editor.innerHTML = markdownToEditorHtml(nextMarkdown)
        placeCaretAtEnd(editor)
      }

      setIsAiPromptOpen(false)
      setAiPromptDraft('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI rewrite failed.'
      setAiRewriteError(message)
    } finally {
      setIsAiRewriting(false)
    }
  }, [aiPromptDraft, applyValueWithHeadingGuard, blockId, draftMarkdownRef, editorRef, includeWholeArticleContext, onAiRewrite])

  const resetAiUi = useCallback(() => {
    setIsAiPromptOpen(false)
    setIsAiRewriting(false)
    setAiRewriteError(null)
    setIncludeWholeArticleContext(false)
  }, [])

  return {
    isAiPromptOpen,
    aiPromptDraft,
    isAiRewriting,
    aiRewriteError,
    includeWholeArticleContext,
    setIsAiPromptOpen,
    setAiPromptDraft,
    setAiRewriteError,
    setIncludeWholeArticleContext,
    openAiRewritePrompt,
    runAiRewrite,
    resetAiUi,
  }
}
