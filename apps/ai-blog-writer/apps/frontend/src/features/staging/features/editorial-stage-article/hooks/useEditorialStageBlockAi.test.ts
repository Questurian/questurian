import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StagedArticle } from '../../../types'
import { buildTimelineItems } from '../workflow.service'
import { useEditorialStageBlockAi } from './useEditorialStageBlockAi'

function stagedArticle(overrides: Partial<StagedArticle> = {}): StagedArticle {
  return {
    id: 'stage',
    runId: 'run',
    originalTitle: 'Original title',
    originalContent: 'Original content.',
    originalType: 'article',
    title: 'Current title',
    content: 'Current content.',
    blocks: [
      { id: 'intro', type: 'text', content: 'Intro copy.' },
      { id: 'quote', type: 'pullquote', content: 'Quoted copy.' }
    ],
    editorialBlocks: [],
    sharedNeighborhoods: [],
    lexicalConverted: false,
    publishedToPayload: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('useEditorialStageBlockAi', () => {
  it('rewrites a text block with normalized model, title, and optional context', async () => {
    const article = stagedArticle({ editorModelName: 'gemini-2.5-pro' })
    const rewriteBlockWithAi = vi.fn().mockResolvedValue({
      rewritten_content: '  Revised intro.  '
    })
    const { result } = renderHook(() =>
      useEditorialStageBlockAi({
        stagedArticle: article,
        timelineItems: buildTimelineItems(
          article.blocks,
          article.editorialBlocks
        ),
        rewriteBlockWithAi
      })
    )

    let rewritten = ''
    await act(async () => {
      rewritten = await result.current.rewriteTextBlockWithAi(
        'intro',
        'Draft intro.',
        'Make it clearer.',
        true
      )
    })

    expect(rewritten).toBe('Revised intro.')
    expect(rewriteBlockWithAi).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Make it clearer.',
        blockContent: 'Draft intro.',
        modelName: 'gemini-2.5-pro',
        articleTitle: 'Current title',
        articleContext: expect.stringContaining('Intro copy.')
      })
    )
  })

  it('rejects non-text blocks before calling the AI service', async () => {
    const article = stagedArticle()
    const rewriteBlockWithAi = vi.fn()
    const { result } = renderHook(() =>
      useEditorialStageBlockAi({
        stagedArticle: article,
        timelineItems: [],
        rewriteBlockWithAi
      })
    )

    await expect(
      result.current.rewriteTextBlockWithAi(
        'quote',
        'Quoted copy.',
        'Rewrite.',
        false
      )
    ).rejects.toThrow('AI rewrite is only available for text blocks.')
    expect(rewriteBlockWithAi).not.toHaveBeenCalled()
  })
})
