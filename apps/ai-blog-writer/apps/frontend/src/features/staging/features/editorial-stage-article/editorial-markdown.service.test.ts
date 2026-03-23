import { describe, expect, it } from 'vitest'
import type { EditorialBlock } from '../../types'
import {
  extractEditorialBlocks,
  buildCanonicalFAQMarkdown,
  getEditorialBlockBody,
  validateEditorialBlockForPublish,
} from './editorial-markdown.service'

function buildEditorialBlock(markdown: string, component: string, label: string): EditorialBlock {
  return {
    id: `editorial-${component}`,
    component,
    label,
    markdown,
    afterBlockId: null,
    placeAfterImage: false,
  }
}

describe('editorial markdown support', () => {
  it('maps faq_block markdown into a Payload FAQ block', () => {
    const block = buildEditorialBlock(
      [
        '> [!EDITORIAL-BLOCK-START|faq_block]',
        '> [!EDITORIAL-BLOCK-LABEL|Frequently Asked Questions]',
        '> [!EDITORIAL-BOX|faq_block]',
        '> **Component:** FAQ Block',
        '> **Q:** When is the best time to visit?',
        '> A: Dry months are usually the easiest for planning.',
        '> **Q:** Is it expensive?',
        '> A: Shoulder season tends to offer better value.',
        '> [!EDITORIAL-BLOCK-END|faq_block]',
      ].join('\n'),
      'faq_block',
      'Frequently Asked Questions',
    )

    const validation = validateEditorialBlockForPublish(block)
    expect(validation.status).toBe('supported')
    if (validation.status !== 'supported') return

    expect(validation.mappedPayloadBlockType).toBe('faq')
    expect(validation.payloadBlock).toEqual({
      blockType: 'faq',
      label: 'Frequently Asked Questions',
      items: [
        {
          question: 'When is the best time to visit?',
          answer: 'Dry months are usually the easiest for planning.',
        },
        {
          question: 'Is it expensive?',
          answer: 'Shoulder season tends to offer better value.',
        },
      ],
    })
    expect(getEditorialBlockBody(block.markdown)).not.toContain('[!EDITORIAL-BLOCK-START')
  })

  it('maps highlight_callout markdown into a Payload highlight-callout block', () => {
    const block = buildEditorialBlock(
      [
        '> [!EDITORIAL-BLOCK-START|highlight_callout]',
        '> [!EDITORIAL-BLOCK-LABEL|Why This Matters]',
        '> [!EDITORIAL-BOX|highlight_callout]',
        '> **Component:** Highlight Callout',
        '> This destination works best when travelers balance cost and weather.',
        '> [!EDITORIAL-BLOCK-END|highlight_callout]',
      ].join('\n'),
      'highlight_callout',
      'Why This Matters',
    )

    const validation = validateEditorialBlockForPublish(block)
    expect(validation.status).toBe('supported')
    if (validation.status !== 'supported') return

    expect(validation.mappedPayloadBlockType).toBe('highlight-callout')
    expect(validation.payloadBlock).toEqual({
      blockType: 'highlight-callout',
      label: 'Why This Matters',
      text: 'This destination works best when travelers balance cost and weather.',
    })
  })

  it('accepts the canonical FAQ markdown format after reload', () => {
    const block = buildEditorialBlock(
      buildCanonicalFAQMarkdown('Frequently Asked Questions', [
        {
          question: 'When is the best time to visit?',
          answer: 'Dry months are usually the easiest for planning.',
        },
        {
          question: 'Is it expensive?',
          answer: 'Shoulder season tends to offer better value.',
        },
      ]),
      'faq_block',
      'Frequently Asked Questions',
    )

    const validation = validateEditorialBlockForPublish(block)
    expect(validation.status).toBe('supported')
  })

  it('drops metadata-only FAQ placeholders during extraction', () => {
    const extracted = extractEditorialBlocks([
      '## Overview',
      '',
      '> [!EDITORIAL-BLOCK-START|faq_block]',
      '> [!EDITORIAL-BLOCK-LABEL|FAQ Block]',
      '> [!EDITORIAL-BOX|faq_block]',
      '> **Component:** FAQ Block',
      '> **Why:** Added for search-intent coverage.',
      '> [!EDITORIAL-BLOCK-END|faq_block]',
      '',
      'Body copy continues here.',
    ].join('\n'))

    expect(extracted.editorialBlocks).toHaveLength(0)
    expect(extracted.bodyMarkdown).toContain('## Overview')
    expect(extracted.bodyMarkdown).toContain('Body copy continues here.')
    expect(extracted.bodyMarkdown).not.toContain('[!EDITORIAL-BLOCK-START|faq_block]')
  })
})
