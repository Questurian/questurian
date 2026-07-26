import { describe, expect, it } from 'vitest'
import type { EditorialBlock } from '../../../types'
import {
  repairEditorialBlock,
  replaceEditorialBlockMarkdown
} from './editorial-block-editing'

function editorialBlock(
  overrides: Partial<EditorialBlock> = {}
): EditorialBlock {
  return {
    id: 'editorial',
    component: 'highlight_callout',
    label: 'Old label',
    markdown: '> Existing content.',
    afterBlockId: null,
    placeAfterImage: false,
    ...overrides
  }
}

describe('editorial block editing', () => {
  it('repairs a supported block frame and keeps its meaningful content', () => {
    const result = repairEditorialBlock(
      [
        editorialBlock({
          component: 'highlight',
          markdown: '> Useful context.'
        })
      ],
      'editorial'
    )

    expect(result?.status).toBe('updated')
    if (!result || result.status !== 'updated') return

    expect(result.editorialBlocks[0]).toEqual(
      expect.objectContaining({
        component: 'highlight_callout',
        label: 'Old label'
      })
    )
    expect(result.editorialBlocks[0].markdown).toContain(
      '[!EDITORIAL-BLOCK-START|highlight_callout]'
    )
    expect(result.editorialBlocks[0].markdown).toContain('Useful context.')
  })

  it('reports unsupported components without changing the block list', () => {
    expect(
      repairEditorialBlock(
        [editorialBlock({ component: 'unknown_widget' })],
        'editorial'
      )
    ).toEqual({
      status: 'unsupported',
      component: 'unknown_widget'
    })
  })

  it('updates component and label metadata from edited markdown markers', () => {
    const markdown = [
      '> [!EDITORIAL-BLOCK-START|pullquote]',
      '> [!EDITORIAL-BLOCK-LABEL|A better label]',
      '> Quoted text.',
      '> [!EDITORIAL-BLOCK-END|pull_quote]'
    ].join('\n')

    expect(
      replaceEditorialBlockMarkdown(
        [editorialBlock()],
        'editorial',
        markdown
      )[0]
    ).toEqual(
      expect.objectContaining({
        component: 'pull_quote',
        label: 'A better label',
        markdown
      })
    )
  })
})
