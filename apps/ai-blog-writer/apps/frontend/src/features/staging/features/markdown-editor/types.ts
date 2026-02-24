export type ToolbarActionKey =
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
}

export type MarkdownHeading = {
  level: number
  lineIndex: number
  signature: string
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
  className?: string
  rows?: number
  placeholder?: string
}
