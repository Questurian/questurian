import type { ContentBlock, EditorialBlock, StagedArticle } from '../../../types'
import { createStagedId } from '../create-staged-id'
import { isTextualBlock } from '../content-blocks/block-media'
import { parseMarkdownToBlocks } from '../content-blocks/markdown-block-parser'

export const ARTICLE_MARKDOWN_START = '<!-- QUESTURA_ARTICLE_START -->'
export const ARTICLE_MARKDOWN_END = '<!-- QUESTURA_ARTICLE_END -->'

const EDITING_RULES = [
  'Edit only the article between the two QUESTURA markers.',
  'Return exactly one Markdown document between the same markers. Add nothing before or after them.',
  'Keep exactly one H1 (`# Title`) as the first article line. Use H2 (`##`) for main sections and H3 (`###`) only inside an H2 section.',
  'Use plain Markdown text only: paragraphs, emphasis, links, blockquotes, and ordered or unordered lists are allowed.',
  'Do not add images, HTML, frontmatter, fenced code, editorial blocks, custom components, JSON, explanations, or HTML comments other than the two required QUESTURA markers.',
  'Keep every factual claim and destination-specific detail accurate. Do not invent facts, links, quotes, or placeholders.',
]

export type ParsedArticleMarkdown = {
  title: string
  body: string
  blocks: ContentBlock[]
}

export type ArticleMarkdownImport = ParsedArticleMarkdown & {
  nextBlocks: ContentBlock[]
  nextEditorialBlocks: EditorialBlock[]
  preservedMediaCount: number
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1
}

function stripOuterMarkdownFence(value: string): string {
  const trimmed = value.trim()
  const match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i)
  return match ? match[1].trim() : trimmed
}

function extractArticleDocument(value: string): string {
  const normalized = value.replace(/\r\n?/g, '\n').trim()
  const startCount = countOccurrences(normalized, ARTICLE_MARKDOWN_START)
  const endCount = countOccurrences(normalized, ARTICLE_MARKDOWN_END)

  if (startCount !== endCount) {
    throw new Error('Paste includes only one QUESTURA marker. Include both start and end markers.')
  }

  if (startCount > 1 || endCount > 1) {
    throw new Error('Paste includes duplicate QUESTURA markers. Include one start and one end marker.')
  }

  if (startCount === 1) {
    const startIndex = normalized.indexOf(ARTICLE_MARKDOWN_START) + ARTICLE_MARKDOWN_START.length
    const endIndex = normalized.indexOf(ARTICLE_MARKDOWN_END, startIndex)
    if (endIndex < startIndex) {
      throw new Error('QUESTURA end marker must follow the start marker.')
    }
    return normalized.slice(startIndex, endIndex).trim()
  }

  return stripOuterMarkdownFence(normalized)
}

function validateArticleDocument(markdown: string): void {
  if (!markdown) throw new Error('Paste contains no article Markdown.')

  if (/^\s*---\s*$/m.test(markdown.split('\n').slice(0, 2).join('\n'))) {
    throw new Error('Frontmatter is not allowed. Start with one H1 title.')
  }
  if (/^\s*(?:```|~~~)/m.test(markdown)) {
    throw new Error('Fenced code is not allowed. Paste raw Markdown, without a code fence.')
  }
  if (/!\[[^\]]*\]\s*\([^)]*\)|<img\b/i.test(markdown)) {
    throw new Error('Images are not allowed. Existing staged images are preserved automatically.')
  }
  if (/\[!EDITORIAL-BLOCK-|<!--/i.test(markdown)) {
    throw new Error('Editorial blocks and HTML comments are not allowed. Existing editorial blocks are preserved automatically.')
  }
  if (/<\/?[a-z][a-z0-9-]*(?:\s[^>]*)?\/?>/i.test(markdown)) {
    throw new Error('HTML is not allowed. Use plain Markdown only.')
  }

  const lines = markdown.split('\n')
  const firstContentLine = lines.findIndex((line) => line.trim().length > 0)
  if (firstContentLine < 0 || !/^#\s+\S/.test(lines[firstContentLine].trim())) {
    throw new Error('First article line must be one H1 title: `# Title`.')
  }

  const h1Lines = lines.filter((line) => /^#\s+\S/.test(line.trim()))
  if (h1Lines.length !== 1) {
    throw new Error('Article must contain exactly one H1 title.')
  }
}

export function buildTextOnlyArticleMarkdown(article: StagedArticle): string {
  const title = (article.title || article.originalTitle || 'Untitled Article')
    .replace(/\s+/g, ' ')
    .trim()
  const body = article.blocks
    .filter(isTextualBlock)
    .map((block) => block.content.trim())
    .filter(Boolean)
    .join('\n\n')

  return `# ${title}\n\n${body}`.trim()
}

export function buildArticleAiEditingClipboard(article: StagedArticle): string {
  const numberedRules = EDITING_RULES.map((rule, index) => `${index + 1}. ${rule}`).join('\n')
  return [
    'Revise this article using my instructions. Strict return contract:',
    numberedRules,
    ARTICLE_MARKDOWN_START,
    buildTextOnlyArticleMarkdown(article),
    ARTICLE_MARKDOWN_END,
  ].join('\n\n')
}

export function parseArticleMarkdown(value: string): ParsedArticleMarkdown {
  const markdown = extractArticleDocument(value)
  validateArticleDocument(markdown)

  const lines = markdown.split('\n')
  const firstContentLine = lines.findIndex((line) => line.trim().length > 0)
  const title = lines[firstContentLine].trim().replace(/^#\s+/, '').trim()
  const body = lines.slice(firstContentLine + 1).join('\n').trim()

  if (!title) throw new Error('H1 title cannot be empty.')
  if (!body) throw new Error('Article body cannot be empty.')

  const blocks = parseMarkdownToBlocks(body)
  if (blocks.length === 0) throw new Error('Article body produced no text blocks.')

  return { title, body, blocks }
}

function mergeTextBlocks(
  existingBlocks: ContentBlock[],
  importedBlocks: ContentBlock[],
  createId: () => string,
): {
  blocks: ContentBlock[]
  removedTextAnchorMap: Map<string, string | null>
  preservedMediaCount: number
} {
  const existingTextBlocks = existingBlocks.filter(isTextualBlock)
  const importedWithStableIds = importedBlocks.map((block, index) => {
    const existing = existingTextBlocks[index]
    return {
      ...block,
      id: existing?.id || createId(),
      type: existing?.type || 'text',
    } satisfies ContentBlock
  })
  const blocks: ContentBlock[] = []
  const removedTextAnchorMap = new Map<string, string | null>()
  let lastExistingTextIndex = -1
  for (let index = existingBlocks.length - 1; index >= 0; index -= 1) {
    if (isTextualBlock(existingBlocks[index])) {
      lastExistingTextIndex = index
      break
    }
  }
  let importedIndex = 0
  let previousSurvivingBlockId: string | null = null

  if (lastExistingTextIndex < 0) {
    blocks.push(...importedWithStableIds)
    previousSurvivingBlockId = importedWithStableIds[importedWithStableIds.length - 1]?.id || null
  }

  existingBlocks.forEach((existingBlock, existingIndex) => {
    if (!isTextualBlock(existingBlock)) {
      blocks.push(existingBlock)
      previousSurvivingBlockId = existingBlock.id
      return
    }

    const imported = importedWithStableIds[importedIndex]
    if (imported) {
      blocks.push(imported)
      previousSurvivingBlockId = imported.id
      importedIndex += 1
    } else {
      removedTextAnchorMap.set(existingBlock.id, previousSurvivingBlockId)
    }

    if (existingIndex === lastExistingTextIndex && importedIndex < importedWithStableIds.length) {
      const extras = importedWithStableIds.slice(importedIndex)
      blocks.push(...extras)
      previousSurvivingBlockId = extras[extras.length - 1]?.id || previousSurvivingBlockId
      importedIndex = importedWithStableIds.length
    }
  })

  return {
    blocks,
    removedTextAnchorMap,
    preservedMediaCount: existingBlocks.filter((block) => !isTextualBlock(block)).length,
  }
}

export function buildArticleMarkdownImport(
  article: StagedArticle,
  value: string,
  createId: () => string = () => createStagedId('block'),
): ArticleMarkdownImport {
  const parsed = parseArticleMarkdown(value)
  const merged = mergeTextBlocks(article.blocks, parsed.blocks, createId)
  const nextEditorialBlocks = (article.editorialBlocks || []).map((block) => {
    if (!block.afterBlockId || !merged.removedTextAnchorMap.has(block.afterBlockId)) return block
    return {
      ...block,
      afterBlockId: merged.removedTextAnchorMap.get(block.afterBlockId) || null,
      placeAfterImage: false,
    }
  })

  return {
    ...parsed,
    nextBlocks: merged.blocks,
    nextEditorialBlocks,
    preservedMediaCount: merged.preservedMediaCount,
  }
}
