import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/* Hoisted: an inline array is a new reference on every render, which defeats
   any memoization inside react-markdown. */
const REMARK_PLUGINS = [remarkGfm]

type HeaderSplitPoint = { lineIndex: number; headerText: string }

type ContentBlockPreviewProps = {
  blockId: string
  content: string
  isEditingLocked: boolean
  findHeaderSplitPoints: (content: string) => HeaderSplitPoint[]
  onSplitAtLine: (blockId: string, lineIndex: number) => void
}

/**
 * Read-only render of one content block, with a Split affordance at each
 * heading after the first.
 *
 * Memoized because it is the article view's hot path: react-markdown re-parses
 * the block's markdown on every render, and this renders once per block. Editing
 * any single block replaces the `blocks` array, so without this every keystroke
 * re-parsed every other block in the article.
 */
function ContentBlockPreviewComponent({
  blockId,
  content,
  isEditingLocked,
  findHeaderSplitPoints,
  onSplitAtLine,
}: ContentBlockPreviewProps) {
  const splitPoints = isEditingLocked ? [] : findHeaderSplitPoints(content)

  if (splitPoints.length === 0) {
    return (
      <div className="block-preview">
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{content}</ReactMarkdown>
      </div>
    )
  }

  const lines = content.split('\n')
  const segments: { content: string; splitLineIndex: number | null }[] = []
  let lastIndex = 0

  for (const point of splitPoints) {
    segments.push({
      content: lines.slice(lastIndex, point.lineIndex).join('\n'),
      splitLineIndex: point.lineIndex,
    })
    lastIndex = point.lineIndex
  }
  segments.push({
    content: lines.slice(lastIndex).join('\n'),
    splitLineIndex: null,
  })

  return (
    <div className="block-preview">
      {segments.map((segment, index) => (
        <div key={index}>
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{segment.content}</ReactMarkdown>
          {segment.splitLineIndex !== null && (
            <div className="block-split-zone">
              <button
                type="button"
                className="block-split-btn"
                onClick={() => onSplitAtLine(blockId, segment.splitLineIndex!)}
                title="Split here"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 3h5v5M8 3H3v5M3 16v5h5M21 16v5h-5"/>
                </svg>
                Split
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export const ContentBlockPreview = memo(ContentBlockPreviewComponent)
