import type { EditorialBlock } from '../../../types'

export function extractEditorialBlocks(markdown: string): {
  bodyMarkdown: string
  editorialBlocks: EditorialBlock[]
} {
  if (!markdown) {
    return { bodyMarkdown: '', editorialBlocks: [] }
  }

  const lines = markdown.split('\n')
  const editorialBlocks: EditorialBlock[] = []
  const bodyLines: string[] = []
  const startRegex = /^\s*>\s*\[!EDITORIAL-BLOCK-START\|([^\]]+)\]\s*$/i
  const endRegex = /^\s*>\s*\[!EDITORIAL-BLOCK-END\|([^\]]+)\]\s*$/i
  const labelRegex = /^\s*>\s*\[!EDITORIAL-BLOCK-LABEL\|([^\]]+)\]\s*$/i

  let index = 0
  while (index < lines.length) {
    const startMatch = lines[index].match(startRegex)
    if (!startMatch) {
      bodyLines.push(lines[index])
      index++
      continue
    }

    const component = startMatch[1].trim()
    const blockLines = [lines[index]]
    let label = component
    let cursor = index + 1
    let foundEnd = false

    while (cursor < lines.length) {
      const line = lines[cursor]
      blockLines.push(line)

      const labelMatch = line.match(labelRegex)
      if (labelMatch && labelMatch[1]?.trim()) {
        label = labelMatch[1].trim()
      }

      const endMatch = line.match(endRegex)
      if (
        endMatch
        && endMatch[1]?.trim().toLowerCase() === component.toLowerCase()
      ) {
        foundEnd = true
        break
      }

      cursor++
    }

    if (!foundEnd) {
      bodyLines.push(...blockLines)
      index = cursor + 1
      continue
    }

    const blockMarkdown = blockLines.join('\n').trim()
    if (!getEditorialBlockBody(blockMarkdown)) {
      index = cursor + 1
      continue
    }

    editorialBlocks.push({
      id: `editorial_${index}_${editorialBlocks.length}`,
      component,
      label,
      markdown: blockMarkdown,
      anchorLine: bodyLines.length,
      afterBlockId: null,
      placeAfterImage: false,
    })

    index = cursor + 1
  }

  return {
    bodyMarkdown: bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    editorialBlocks,
  }
}

export function normalizeEditorialBlocks(
  blocks: EditorialBlock[] | undefined
): EditorialBlock[] {
  if (!blocks || !Array.isArray(blocks)) return []

  return blocks
    .map((block, index) => ({
      id: block.id || `editorial_${index}`,
      component: block.component || 'unknown',
      label: block.label || block.component || 'Editorial Block',
      markdown: block.markdown || '',
      anchorLine:
        typeof block.anchorLine === 'number' ? block.anchorLine : undefined,
      afterBlockId:
        typeof block.afterBlockId === 'string' || block.afterBlockId === null
          ? block.afterBlockId
          : undefined,
      placeAfterImage: block.placeAfterImage === true,
    }))
    .filter((block) => block.markdown.trim().length > 0)
}

export function getEditorialBlockBody(markdown: string): string {
  const lines = markdown.split('\n')
  const cleaned = lines
    .map((line) => line.replace(/^\s*>\s?/, ''))
    .filter((line) => {
      const trimmed = line.trim()
      if (!trimmed) return true
      if (/^\[!EDITORIAL-BLOCK-START\|/i.test(trimmed)) return false
      if (/^\[!EDITORIAL-BLOCK-END\|/i.test(trimmed)) return false
      if (/^\[!EDITORIAL-BLOCK-LABEL\|/i.test(trimmed)) return false
      if (/^\[!EDITORIAL-BOX\|/i.test(trimmed)) return false
      if (/^\*\*component:\*\*/i.test(trimmed)) return false
      if (/^\*\*(placement|why):\*\*/i.test(trimmed)) return false
      if (/^(placement|why)\s*:/i.test(trimmed)) return false
      return true
    })
    .join('\n')

  return cleaned.trim()
}
