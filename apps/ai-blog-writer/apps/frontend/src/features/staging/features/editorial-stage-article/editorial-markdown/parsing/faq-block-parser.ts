import type { EditorialBlock } from '../../../../types'
import { FAQ_COMPONENT, FAQ_LABEL } from '../../constants'
import type { FAQItem } from '../publishing/editorial-publish.types'
import { buildCanonicalFAQMarkdown } from '../templates/canonical-markdown'
import { parseEditorialFrame } from './editorial-frame'

function normalizeFAQContentLine(line: string): string {
  return line
    .trim()
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/^#{1,6}\s+/, '')
    .trim()
}

function stripFAQInlineFormatting(line: string): string {
  return line
    .trim()
    .replace(/^\*\*((?:q|question|a|answer)(?:\s*\d+)?)\s*:\*\*\s*/i, '$1: ')
    .replace(/^__((?:q|question|a|answer)(?:\s*\d+)?)\s*:__\s*/i, '$1: ')
    .replace(/^\*\*(.+)\*\*$/, '$1')
    .replace(/^__(.+)__$/, '$1')
    .trim()
}

function extractFAQQuestionText(line: string): string | null {
  const normalizedLine = stripFAQInlineFormatting(normalizeFAQContentLine(line))
  const labeledQuestion = normalizedLine.match(
    /^(?:q|question)(?:\s*\d+)?\s*:\s*(.+)$/i
  )
  if (labeledQuestion) {
    return labeledQuestion[1].trim() || null
  }
  return /\?$/.test(normalizedLine) ? normalizedLine : null
}

function extractFAQAnswerText(line: string): string | null {
  const normalizedLine = stripFAQInlineFormatting(normalizeFAQContentLine(line))
  const labeledAnswer = normalizedLine.match(
    /^(?:a|answer)(?:\s*\d+)?\s*:\s*(.+)$/i
  )
  if (labeledAnswer) {
    return labeledAnswer[1].trim() || null
  }
  return null
}

export function parseFAQEditorialBlock(block: EditorialBlock): {
  label: string
  items: FAQItem[]
  hasStartMarker: boolean
  hasEndMarker: boolean
  hasLabelMarker: boolean
  hasBoxMarker: boolean
  hasComponentLine: boolean
  correctedMarkdown: string
} {
  const frame = parseEditorialFrame(block, FAQ_COMPONENT)
  const lines = frame.bodyLines
    .map(normalizeFAQContentLine)
    .filter((line) => (
      Boolean(line)
      && !/^(placement|why)\s*:/i.test(line)
      && !/^\*\*(placement|why):\*\*/i.test(line)
    ))

  let items: FAQItem[] = []
  let currentQuestion = ''
  let currentAnswerLines: string[] = []

  const pushCurrentItem = () => {
    const question = currentQuestion.trim()
    const answer = currentAnswerLines.join(' ').trim()
    if (question && answer) {
      items.push({ question, answer })
    }
    currentQuestion = ''
    currentAnswerLines = []
  }

  lines.forEach((line) => {
    const normalizedLine = line.replace(/^\s*>\s?/, '').trim()
    const normalizedText = stripFAQInlineFormatting(normalizedLine)
    const questionText = extractFAQQuestionText(normalizedLine)
    if (questionText) {
      pushCurrentItem()
      currentQuestion = questionText
      return
    }

    const answerText = extractFAQAnswerText(normalizedLine)
    if (answerText) {
      if (!currentQuestion) {
        currentQuestion = 'Add FAQ question?'
      }
      currentAnswerLines.push(answerText)
      return
    }

    const sameLineQA = normalizedText.match(/^(.+\?)\s+(.+)$/)
    if (sameLineQA) {
      pushCurrentItem()
      items.push({
        question: sameLineQA[1].trim(),
        answer: sameLineQA[2].trim(),
      })
      return
    }

    if (currentQuestion) {
      currentAnswerLines.push(normalizedText)
    }
  })

  pushCurrentItem()

  if (items.length < 2) {
    const fallbackItems: FAQItem[] = []

    for (let index = 0; index < lines.length; index += 1) {
      const question = extractFAQQuestionText(lines[index])
      if (!question) continue

      const nextLine = lines[index + 1]
      if (!nextLine) continue

      const answer = extractFAQAnswerText(nextLine) || stripFAQInlineFormatting(nextLine)
      if (!answer || extractFAQQuestionText(nextLine)) continue

      fallbackItems.push({
        question,
        answer,
      })
      index += 1
    }

    if (fallbackItems.length > items.length) {
      items = fallbackItems
    }
  }

  const label = frame.label || FAQ_LABEL
  return {
    ...frame,
    label,
    items,
    correctedMarkdown: buildCanonicalFAQMarkdown(label, items),
  }
}
