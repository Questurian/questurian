import { describe, expect, it } from 'vitest'
import type { StagedArticle } from '../../../types'
import {
  ARTICLE_MARKDOWN_END,
  ARTICLE_MARKDOWN_START,
  buildArticleAiEditingClipboard,
  buildArticleMarkdownImport,
  parseArticleMarkdown,
} from './article-markdown-round-trip.service'

function makeArticle(): StagedArticle {
  return {
    id: 'staged_1',
    runId: 'run_1',
    originalTitle: 'Original title',
    originalContent: 'Original content',
    originalType: 'guide',
    title: 'Current title',
    content: 'composed content',
    blocks: [
      { id: 'intro', type: 'text', content: 'Opening paragraph.' },
      { id: 'photo', type: 'image', content: '', imageAfter: 42 },
      { id: 'section', type: 'text', content: '## Existing section\n\nExisting body.' },
    ],
    editorialBlocks: [{
      id: 'editorial',
      component: 'highlight_callout',
      label: 'In the Know',
      markdown: '> [!EDITORIAL-BLOCK-START|highlight_callout]\n> Secret editorial copy.\n> [!EDITORIAL-BLOCK-END|highlight_callout]',
      afterBlockId: 'section',
    }],
    sharedNeighborhoods: [],
    lexicalConverted: false,
    publishedToPayload: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('article Markdown round trip', () => {
  it('copies strict instructions with text-only Markdown', () => {
    const clipboard = buildArticleAiEditingClipboard(makeArticle())

    expect(clipboard).toContain('Strict return contract')
    expect(clipboard).toContain(ARTICLE_MARKDOWN_START)
    expect(clipboard).toContain('# Current title')
    expect(clipboard).toContain('Opening paragraph.')
    expect(clipboard).toContain('## Existing section')
    expect(clipboard).toContain(ARTICLE_MARKDOWN_END)
    expect(clipboard).not.toContain('Secret editorial copy')
    expect(clipboard).not.toContain('imageAfter')
  })

  it('extracts a marked AI response and builds text blocks', () => {
    const parsed = parseArticleMarkdown([
      'Here is text that import must ignore.',
      ARTICLE_MARKDOWN_START,
      '# Better title',
      '',
      'Improved opening.',
      '',
      '## Better section',
      '',
      '- One',
      '- Two',
      ARTICLE_MARKDOWN_END,
      'More ignored text.',
    ].join('\n'))

    expect(parsed.title).toBe('Better title')
    expect(parsed.blocks).toHaveLength(2)
    expect(parsed.blocks[0].content).toBe('Improved opening.')
    expect(parsed.blocks[1].content).toContain('## Better section')
  })

  it.each([
    ['missing H1', '## Section\n\nBody', 'First article line'],
    ['second H1', '# Title\n\n# Other\n\nBody', 'exactly one H1'],
    ['image', '# Title\n\n![Alt](photo.jpg)', 'Images are not allowed'],
    ['editorial block', '# Title\n\n> [!EDITORIAL-BLOCK-START|faq]', 'Editorial blocks'],
    ['HTML', '# Title\n\n<section>Body</section>', 'HTML is not allowed'],
    ['code fence', '# Title\n\n```md\nBody\n```', 'Fenced code'],
  ])('rejects %s', (_name, markdown, expectedMessage) => {
    expect(() => parseArticleMarkdown(markdown)).toThrow(expectedMessage)
  })

  it('replaces text while preserving image and editorial blocks', () => {
    const article = makeArticle()
    const imported = buildArticleMarkdownImport(article, [
      '# Revised title',
      '',
      'Revised opening.',
      '',
      '## Revised section',
      '',
      'Revised body.',
      '',
      '## Added section',
      '',
      'Added body.',
    ].join('\n'), () => 'new-section')

    expect(imported.title).toBe('Revised title')
    expect(imported.nextBlocks.map((block) => block.id)).toEqual([
      'intro',
      'photo',
      'section',
      'new-section',
    ])
    expect(imported.nextBlocks.find((block) => block.id === 'photo')).toEqual(article.blocks[1])
    expect(imported.nextEditorialBlocks).toEqual(article.editorialBlocks)
    expect(imported.preservedMediaCount).toBe(1)
  })

  it('reanchors editorial blocks when imported text has fewer sections', () => {
    const article = makeArticle()
    article.editorialBlocks[0].afterBlockId = 'section'

    const imported = buildArticleMarkdownImport(
      article,
      '# Revised title\n\nOnly one text block remains.',
    )

    expect(imported.nextBlocks.map((block) => block.id)).toEqual(['intro', 'photo'])
    expect(imported.nextEditorialBlocks[0].afterBlockId).toBe('photo')
  })

  it('allows Markdown autolinks while rejecting HTML tags', () => {
    const parsed = parseArticleMarkdown('# Title\n\nVisit <https://example.com>.')
    expect(parsed.body).toContain('<https://example.com>')
  })
})
