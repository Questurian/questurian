export type ToolbarActionKey =
  | 'paragraph'
  | 'h2'
  | 'h3'
  | 'bullets'
  | 'numbered'
  | 'quote'
  | 'bold'
  | 'italic'
  | 'link'
  | 'ai'

export type ToolbarAction = {
  key: ToolbarActionKey
  label: string
  title: string
  /** Formatting toggles report pressed state; Link and AI just open a popover. */
  isToggle?: boolean
}

export type MarkdownHeading = {
  level: number
  lineIndex: number
}

export type MarkdownBlockEditorProps = {
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
  aiToolbarLabel?: string
  aiToolbarTitle?: string
  className?: string
  rows?: number
  placeholder?: string
  ariaLabel?: string
}
