import type { EditorialBlock } from '../../../../types'
import { normalizeEditorialComponentKey } from '../component-key'

export type EditorialFrame = {
  label: string
  bodyLines: string[]
  hasStartMarker: boolean
  hasEndMarker: boolean
  hasLabelMarker: boolean
  hasBoxMarker: boolean
  hasComponentLine: boolean
}

export function parseEditorialFrame(
  block: EditorialBlock,
  expectedComponent: string
): EditorialFrame {
  const lines = block.markdown
    .split('\n')
    .map((line) => line.replace(/^\s*>\s?/, '').trim())

  let hasStartMarker = false
  let hasEndMarker = false
  let hasLabelMarker = false
  let hasBoxMarker = false
  let hasComponentLine = false
  let labelFromMarker = ''
  const bodyLines: string[] = []

  lines.forEach((line) => {
    if (!line) return

    const startMatch = line.match(/^\[!EDITORIAL-BLOCK-START\|([^\]]+)\]$/i)
    if (startMatch) {
      hasStartMarker = normalizeEditorialComponentKey(startMatch[1]) === expectedComponent
      return
    }

    const endMatch = line.match(/^\[!EDITORIAL-BLOCK-END\|([^\]]+)\]$/i)
    if (endMatch) {
      hasEndMarker = normalizeEditorialComponentKey(endMatch[1]) === expectedComponent
      return
    }

    const labelMatch = line.match(/^\[!EDITORIAL-BLOCK-LABEL\|([^\]]*)\]\s*(.*)$/i)
    if (labelMatch) {
      hasLabelMarker = true
      const capturedLabel = labelMatch[1].trim()
      if (capturedLabel) {
        labelFromMarker = capturedLabel
      }
      const trailingText = labelMatch[2]?.trim()
      if (trailingText) {
        bodyLines.push(trailingText)
      }
      return
    }

    const boxMatch = line.match(/^\[!EDITORIAL-BOX\|([^\]]+)\]$/i)
    if (boxMatch) {
      hasBoxMarker = normalizeEditorialComponentKey(boxMatch[1]) === expectedComponent
      return
    }

    if (/^\*\*Component:\*\*/i.test(line)) {
      hasComponentLine = true
      return
    }

    bodyLines.push(line)
  })

  return {
    label: labelFromMarker || block.label,
    bodyLines,
    hasStartMarker,
    hasEndMarker,
    hasLabelMarker,
    hasBoxMarker,
    hasComponentLine,
  }
}
