import type { ContentBlock } from '../../../types'

function stripLeadingH1WithOffset(markdown: string): {
  markdown: string
  removedLineCount: number
} {
  if (!markdown) {
    return {
      markdown: '',
      removedLineCount: 0,
    }
  }

  const lines = markdown.split('\n')
  if (!/^#\s+/.test(lines[0].trimStart())) {
    return {
      markdown: markdown.trim(),
      removedLineCount: 0,
    }
  }

  let contentStart = 1
  while (contentStart < lines.length && lines[contentStart].trim() === '') {
    contentStart++
  }

  return {
    markdown: lines.slice(contentStart).join('\n').trim(),
    removedLineCount: contentStart,
  }
}

function getMarkdownHeaderLevel(line: string): number | null {
  const match = line.trimStart().match(/^(#{1,6})\s+/)
  if (!match) return null
  return match[1].length
}

function resolveSplitLevel(lines: string[]): number | null {
  const headerLevels = lines
    .map(getMarkdownHeaderLevel)
    .filter((level): level is number => level !== null)
  return headerLevels.includes(2)
    ? 2
    : headerLevels.includes(1)
      ? 1
      : headerLevels.length
        ? Math.min(...headerLevels)
        : null
}

export function parseMarkdownToBlocksDetailed(markdown: string): {
  blocks: ContentBlock[]
  ranges: Array<{ id: string; startLine: number; endLine: number }>
} {
  const { markdown: strippedMarkdown, removedLineCount } =
    stripLeadingH1WithOffset(markdown)
  const lines = strippedMarkdown.split('\n')
  const splitLevel = resolveSplitLevel(lines)

  const blocks: ContentBlock[] = []
  const ranges: Array<{ id: string; startLine: number; endLine: number }> = []
  let currentBlock: string[] = []
  let blockIndex = 0
  let currentStartLine = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const headerLevel = getMarkdownHeaderLevel(line)
    const isSplitHeader = splitLevel !== null && headerLevel === splitLevel

    if (isSplitHeader && currentBlock.length > 0) {
      const id = `block_${blockIndex++}`
      const content = currentBlock.join('\n').trim()
      blocks.push({
        id,
        type: 'text',
        content,
      })
      ranges.push({
        id,
        startLine: currentStartLine + removedLineCount,
        endLine: i - 1 + removedLineCount,
      })
      currentBlock = [line]
      currentStartLine = i
    } else {
      if (currentBlock.length === 0) {
        currentStartLine = i
      }
      currentBlock.push(line)
    }
  }

  if (currentBlock.length > 0) {
    const content = currentBlock.join('\n').trim()
    if (content) {
      const id = `block_${blockIndex}`
      blocks.push({
        id,
        type: 'text',
        content,
      })
      ranges.push({
        id,
        startLine: currentStartLine + removedLineCount,
        endLine: lines.length - 1 + removedLineCount,
      })
    }
  }

  return { blocks, ranges }
}

export function parseMarkdownToBlocks(markdown: string): ContentBlock[] {
  return parseMarkdownToBlocksDetailed(markdown).blocks
}
