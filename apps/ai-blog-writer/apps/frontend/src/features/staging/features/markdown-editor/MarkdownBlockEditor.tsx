import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import {
  editorElementToMarkdown,
  markdownToEditorHtml,
  normalizeLinkUrl,
} from './richMarkdown'

type ToolbarActionKey =
  | 'h2'
  | 'h3'
  | 'bullets'
  | 'numbered'
  | 'quote'
  | 'bold'
  | 'italic'
  | 'link'
  | 'ai'

type ToolbarAction = {
  key: ToolbarActionKey
  label: string
  title: string
}

type MarkdownHeading = {
  level: number
  lineIndex: number
  signature: string
}

const BASE_TOOLBAR_ACTIONS: ToolbarAction[] = [
  { key: 'h2', label: 'H2', title: 'Heading 2' },
  { key: 'h3', label: 'H3', title: 'Heading 3' },
  { key: 'bullets', label: 'Bullets', title: 'Toggle bullet list' },
  { key: 'numbered', label: 'Numbered', title: 'Toggle numbered list' },
  { key: 'quote', label: 'Quote', title: 'Toggle blockquote' },
  { key: 'bold', label: 'Bold', title: 'Bold' },
  { key: 'italic', label: 'Italic', title: 'Italic' },
  { key: 'link', label: 'Link', title: 'Insert link' },
]

function resizeTextareaToContent(element: HTMLTextAreaElement): void {
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

function getMarkdownHeadingLevel(line: string): number | null {
  const match = line.trimStart().match(/^(#{1,6})\s+/)
  if (!match) return null
  return match[1].length
}

function collectMarkdownHeadings(text: string): MarkdownHeading[] {
  return text
    .split('\n')
    .map((line, lineIndex) => {
      const level = getMarkdownHeadingLevel(line)
      if (level === null) return null
      return {
        level,
        lineIndex,
        signature: `${level}|${lineIndex}|${line.trim()}`,
      }
    })
    .filter((heading): heading is MarkdownHeading => heading !== null)
}

function getRootHeadingLevel(text: string): number | null {
  const firstHeading = collectMarkdownHeadings(text)[0]
  return firstHeading?.level ?? null
}

function getRestrictedHeadingViolations(
  text: string,
  rootHeadingLevel: number
): MarkdownHeading[] {
  const headings = collectMarkdownHeadings(text)
  if (headings.length === 0) return []

  return headings.filter((heading, index) => {
    if (index === 0) {
      return heading.level < rootHeadingLevel
    }
    return heading.level <= rootHeadingLevel
  })
}

function findNewHeadingViolation(
  currentText: string,
  nextText: string,
  rootHeadingLevel: number
): MarkdownHeading | null {
  const currentViolations = getRestrictedHeadingViolations(currentText, rootHeadingLevel)
  const nextViolations = getRestrictedHeadingViolations(nextText, rootHeadingLevel)
  if (nextViolations.length <= currentViolations.length) return null

  const currentSignatures = new Set(currentViolations.map((heading) => heading.signature))
  return nextViolations.find((heading) => !currentSignatures.has(heading.signature))
    ?? nextViolations[0]
    ?? null
}

function formatHeadingRestrictionMessage(
  rootHeadingLevel: number,
  violationHeadingLevel: number
): string {
  return `This block is anchored at H${rootHeadingLevel}. H${violationHeadingLevel} headings must be added as a new block, not inside this one.`
}

function buildHeadingStructureHint(rootHeadingLevel: number): string {
  if (rootHeadingLevel >= 6) {
    return `Section lock: this block is H${rootHeadingLevel}. Add a new block for additional headings.`
  }

  const nextAllowedLevel = rootHeadingLevel + 1
  const allowedRangeLabel = nextAllowedLevel === 6
    ? 'H6 only'
    : `H${nextAllowedLevel}+`
  return `Section lock: this block is H${rootHeadingLevel}. Use ${allowedRangeLabel} inside this block; add a new block for H${rootHeadingLevel} or higher headings.`
}

function getSelectionRangeWithinEditor(editor: HTMLElement): Range | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.commonAncestorContainer)) return null
  return range
}

function restoreSelectionRange(range: Range): void {
  const selection = window.getSelection()
  if (!selection) return
  selection.removeAllRanges()
  selection.addRange(range)
}

function findClosestElementWithinEditor(
  node: Node | null,
  editor: HTMLElement,
  predicate: (element: HTMLElement) => boolean
): HTMLElement | null {
  if (!node) return null

  let current: Node | null = node
  while (current && current !== editor) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const element = current as HTMLElement
      if (predicate(element)) {
        return element
      }
    }
    current = current.parentNode
  }

  return null
}

function getActiveBlockTag(editor: HTMLElement): string | null {
  const range = getSelectionRangeWithinEditor(editor)
  if (!range) return null

  const block = findClosestElementWithinEditor(
    range.startContainer,
    editor,
    (element) => {
      const tag = element.tagName.toUpperCase()
      return (
        tag === 'P'
        || tag === 'DIV'
        || tag === 'BLOCKQUOTE'
        || tag === 'LI'
        || /^H[1-6]$/.test(tag)
      )
    }
  )

  return block?.tagName.toUpperCase() ?? null
}

function placeCaretAtEnd(editor: HTMLElement): void {
  const selection = window.getSelection()
  if (!selection) return

  const range = document.createRange()
  range.selectNodeContents(editor)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

type MarkdownBlockEditorProps = {
  blockId: string
  value: string
  onChange: (nextValue: string) => void
  showToolbar?: boolean
  enforceHeadingStructure?: boolean
  onAiRewrite?: (input: {
    blockId: string
    currentContent: string
    prompt: string
    includeWholeArticleContext: boolean
  }) => Promise<string>
  className?: string
  rows?: number
  placeholder?: string
}

export function MarkdownBlockEditor({
  blockId,
  value,
  onChange,
  showToolbar = true,
  enforceHeadingStructure = false,
  onAiRewrite,
  className = 'block-textarea',
  rows = 6,
  placeholder = '',
}: MarkdownBlockEditorProps) {
  const isRichEditor = showToolbar
  const editorRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const draftMarkdownRef = useRef<string>(value)
  const previousBlockIdRef = useRef<string>('')
  const lastInitializedBlockIdRef = useRef<string | null>(null)
  const savedSelectionRangeRef = useRef<Range | null>(null)
  const [rootHeadingLevel, setRootHeadingLevel] = useState<number | null>(() => (
    enforceHeadingStructure ? getRootHeadingLevel(value) : null
  ))
  const [headingRestrictionMessage, setHeadingRestrictionMessage] = useState<string | null>(null)
  const [isEditorEmpty, setIsEditorEmpty] = useState<boolean>(value.trim().length === 0)
  const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false)
  const [linkUrlDraft, setLinkUrlDraft] = useState('https://')
  const [linkPopoverError, setLinkPopoverError] = useState<string | null>(null)
  const [isAiPromptOpen, setIsAiPromptOpen] = useState(false)
  const [aiPromptDraft, setAiPromptDraft] = useState('')
  const [isAiRewriting, setIsAiRewriting] = useState(false)
  const [aiRewriteError, setAiRewriteError] = useState<string | null>(null)
  const [includeWholeArticleContext, setIncludeWholeArticleContext] = useState(false)

  useEffect(() => {
    if (!enforceHeadingStructure) {
      lastInitializedBlockIdRef.current = null
      setRootHeadingLevel(null)
      setHeadingRestrictionMessage(null)
      return
    }

    if (lastInitializedBlockIdRef.current === blockId) return

    lastInitializedBlockIdRef.current = blockId
    setRootHeadingLevel(getRootHeadingLevel(value))
    setHeadingRestrictionMessage(null)
  }, [blockId, enforceHeadingStructure, value])

  useEffect(() => {
    const blockChanged = previousBlockIdRef.current !== blockId
    previousBlockIdRef.current = blockId

    if (!blockChanged && value === draftMarkdownRef.current) return

    draftMarkdownRef.current = value
    setIsEditorEmpty(value.trim().length === 0)
    setHeadingRestrictionMessage(null)
    setIsLinkPopoverOpen(false)
    setLinkPopoverError(null)
    setIsAiPromptOpen(false)
    setIsAiRewriting(false)
    setAiRewriteError(null)
    setIncludeWholeArticleContext(false)
    savedSelectionRangeRef.current = null

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
  }, [blockId, isRichEditor, value])

  const headingStructureHint = useMemo(() => {
    if (!enforceHeadingStructure || rootHeadingLevel === null) return null
    return buildHeadingStructureHint(rootHeadingLevel)
  }, [enforceHeadingStructure, rootHeadingLevel])

  const toolbarActions = useMemo(() => {
    if (!onAiRewrite) {
      return BASE_TOOLBAR_ACTIONS
    }

    return [
      ...BASE_TOOLBAR_ACTIONS,
      { key: 'ai' as const, label: 'AI', title: 'Rewrite this block with AI' },
    ]
  }, [onAiRewrite])

  const commitMarkdown = useCallback((nextMarkdown: string) => {
    draftMarkdownRef.current = nextMarkdown
    setIsEditorEmpty(nextMarkdown.trim().length === 0)
    onChange(nextMarkdown)
  }, [onChange])

  const applyValueWithHeadingGuard = useCallback((nextValue: string): boolean => {
    const previousValue = draftMarkdownRef.current

    if (!enforceHeadingStructure || rootHeadingLevel === null) {
      setHeadingRestrictionMessage(null)
      commitMarkdown(nextValue)
      return true
    }

    const violation = findNewHeadingViolation(previousValue, nextValue, rootHeadingLevel)
    if (violation) {
      setHeadingRestrictionMessage(
        formatHeadingRestrictionMessage(rootHeadingLevel, violation.level)
      )
      return false
    }

    setHeadingRestrictionMessage(null)
    commitMarkdown(nextValue)
    return true
  }, [commitMarkdown, enforceHeadingStructure, rootHeadingLevel])

  const syncEditorToMarkdown = useCallback((): boolean => {
    const editor = editorRef.current
    if (!editor) return false

    const nextMarkdown = editorElementToMarkdown(editor)
    if (nextMarkdown === draftMarkdownRef.current) return true

    const didApply = applyValueWithHeadingGuard(nextMarkdown)
    if (!didApply) {
      editor.innerHTML = markdownToEditorHtml(draftMarkdownRef.current)
      placeCaretAtEnd(editor)
    }
    return didApply
  }, [applyValueWithHeadingGuard])

  const setPlainTextareaRef = useCallback((element: HTMLTextAreaElement | null) => {
    textareaRef.current = element
    if (element) {
      resizeTextareaToContent(element)
    }
  }, [])

  const toggleBlockFormat = useCallback((tag: 'H2' | 'H3' | 'BLOCKQUOTE') => {
    const editor = editorRef.current
    if (!editor) return

    editor.focus()
    const activeTag = getActiveBlockTag(editor)
    const nextTag = activeTag === tag ? 'p' : tag.toLowerCase()
    document.execCommand('formatBlock', false, nextTag)
    syncEditorToMarkdown()
  }, [syncEditorToMarkdown])

  const openLinkPopover = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    editor.focus()
    const range = getSelectionRangeWithinEditor(editor)
    if (!range || range.collapsed) {
      setLinkPopoverError('Select text first, then add the link.')
      setIsLinkPopoverOpen(true)
      return
    }

    savedSelectionRangeRef.current = range.cloneRange()
    const anchor = findClosestElementWithinEditor(
      range.startContainer,
      editor,
      (element) => element.tagName.toUpperCase() === 'A'
    )
    const existingHref = anchor?.getAttribute('href') || 'https://'
    setLinkUrlDraft(existingHref)
    setLinkPopoverError(null)
    setIsLinkPopoverOpen(true)
  }, [])

  const applyLink = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    const normalizedUrl = normalizeLinkUrl(linkUrlDraft)
    if (!normalizedUrl) {
      setLinkPopoverError('Enter a valid URL.')
      return
    }

    editor.focus()
    if (savedSelectionRangeRef.current) {
      restoreSelectionRange(savedSelectionRangeRef.current)
    }

    const activeRange = getSelectionRangeWithinEditor(editor)
    if (!activeRange || activeRange.collapsed) {
      setLinkPopoverError('Select text first, then add the link.')
      return
    }

    document.execCommand('createLink', false, normalizedUrl)
    const didApply = syncEditorToMarkdown()
    if (!didApply) return

    setLinkPopoverError(null)
    setIsLinkPopoverOpen(false)
    savedSelectionRangeRef.current = null
  }, [linkUrlDraft, syncEditorToMarkdown])

  const removeLink = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    editor.focus()
    if (savedSelectionRangeRef.current) {
      restoreSelectionRange(savedSelectionRangeRef.current)
    }

    document.execCommand('unlink')
    syncEditorToMarkdown()
    setLinkPopoverError(null)
    setIsLinkPopoverOpen(false)
    savedSelectionRangeRef.current = null
  }, [syncEditorToMarkdown])

  const openAiRewritePrompt = useCallback(() => {
    if (!onAiRewrite) return

    setIsLinkPopoverOpen(false)
    setLinkPopoverError(null)
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
  }, [aiPromptDraft, applyValueWithHeadingGuard, blockId, includeWholeArticleContext, onAiRewrite])

  const handleToolbarAction = useCallback((key: ToolbarActionKey) => {
    const editor = editorRef.current
    if (!editor) return

    if (key === 'ai') {
      openAiRewritePrompt()
      return
    }

    if (key === 'link') {
      openLinkPopover()
      return
    }

    editor.focus()
    switch (key) {
      case 'h2':
        toggleBlockFormat('H2')
        return
      case 'h3':
        toggleBlockFormat('H3')
        return
      case 'quote':
        toggleBlockFormat('BLOCKQUOTE')
        return
      case 'bold':
        document.execCommand('bold')
        break
      case 'italic':
        document.execCommand('italic')
        break
      case 'bullets':
        document.execCommand('insertUnorderedList')
        break
      case 'numbered':
        document.execCommand('insertOrderedList')
        break
      case 'ai':
        return
      default:
        break
    }
    syncEditorToMarkdown()
  }, [openAiRewritePrompt, openLinkPopover, syncEditorToMarkdown, toggleBlockFormat])

  const handleEditorKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    const isMod = event.metaKey || event.ctrlKey
    if (!isMod) return

    const lowerKey = event.key.toLowerCase()
    if (lowerKey === 'b') {
      event.preventDefault()
      handleToolbarAction('bold')
      return
    }
    if (lowerKey === 'i') {
      event.preventDefault()
      handleToolbarAction('italic')
      return
    }
    if (lowerKey === 'k') {
      event.preventDefault()
      handleToolbarAction('link')
    }
  }, [handleToolbarAction])

  if (!isRichEditor) {
    return (
      <textarea
        ref={setPlainTextareaRef}
        className={className}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value
          setHeadingRestrictionMessage(null)
          commitMarkdown(nextValue)
        }}
        onInput={(event) => resizeTextareaToContent(event.currentTarget)}
        rows={rows}
        placeholder={placeholder}
      />
    )
  }

  return (
    <>
      <div className="block-markdown-toolbar">
        {toolbarActions.map((action) => (
          <button
            key={`${blockId}_${action.key}`}
            type="button"
            className="block-markdown-toolbar-btn"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleToolbarAction(action.key)}
            title={action.title}
          >
            {action.label}
          </button>
        ))}
      </div>

      {headingStructureHint && (
        <p className="block-markdown-hint">{headingStructureHint}</p>
      )}

      {isLinkPopoverOpen && (
        <div className="block-markdown-link-popover">
          <input
            type="text"
            className="block-markdown-link-input"
            value={linkUrlDraft}
            onChange={(event) => setLinkUrlDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                applyLink()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                setIsLinkPopoverOpen(false)
                setLinkPopoverError(null)
              }
            }}
            placeholder="https://example.com"
          />
          <button
            type="button"
            className="block-markdown-link-btn"
            onClick={applyLink}
          >
            Apply
          </button>
          <button
            type="button"
            className="block-markdown-link-btn subtle"
            onClick={removeLink}
          >
            Remove
          </button>
          <button
            type="button"
            className="block-markdown-link-btn subtle"
            onClick={() => {
              setIsLinkPopoverOpen(false)
              setLinkPopoverError(null)
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {isAiPromptOpen && (
        <div className="block-markdown-ai-popover">
          <div className="block-markdown-ai-row">
            <input
              type="text"
              className="block-markdown-ai-input"
              value={aiPromptDraft}
              onChange={(event) => setAiPromptDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void runAiRewrite()
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  setIsAiPromptOpen(false)
                  setAiRewriteError(null)
                }
              }}
              placeholder="Tell AI what to change in this block..."
            />
            <button
              type="button"
              className="block-markdown-ai-btn"
              onClick={() => {
                void runAiRewrite()
              }}
              disabled={isAiRewriting}
            >
              {isAiRewriting ? 'Rewriting...' : 'Rewrite'}
            </button>
            <button
              type="button"
              className="block-markdown-ai-btn subtle"
              onClick={() => {
                setIsAiPromptOpen(false)
                setAiRewriteError(null)
              }}
              disabled={isAiRewriting}
            >
              Cancel
            </button>
          </div>
          <label className="block-markdown-ai-context-toggle">
            <input
              type="checkbox"
              checked={includeWholeArticleContext}
              onChange={(event) => setIncludeWholeArticleContext(event.target.checked)}
              disabled={isAiRewriting}
            />
            Include whole article as context
          </label>
        </div>
      )}

      {linkPopoverError && (
        <p className="block-markdown-hint error">{linkPopoverError}</p>
      )}

      {aiRewriteError && (
        <p className="block-markdown-hint error">{aiRewriteError}</p>
      )}

      {headingRestrictionMessage && (
        <p className="block-markdown-hint error">{headingRestrictionMessage}</p>
      )}

      <div
        ref={editorRef}
        className={`block-rich-editor ${isEditorEmpty ? 'is-empty' : ''}`}
        contentEditable
        role="textbox"
        aria-multiline="true"
        suppressContentEditableWarning
        data-placeholder={placeholder || 'Write your content...'}
        onInput={() => {
          syncEditorToMarkdown()
        }}
        onKeyDown={handleEditorKeyDown}
      />
    </>
  )
}
