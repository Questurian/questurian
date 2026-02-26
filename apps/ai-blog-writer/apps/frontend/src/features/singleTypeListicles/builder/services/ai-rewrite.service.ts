import type { ListicleItemBlock, SingleTypeListicleDraft } from '../../types'

const LISTICLE_BLOCK_LABELS: Record<ListicleItemBlock['blockType'], string> = {
  'data-dining': 'Dining',
  'data-accommodations': 'Accommodations',
  'data-attractions': 'Attractions',
  'data-nightlife': 'Nightlife',
}

function buildSection(label: string, content: string): string | null {
  const normalizedContent = content.trim()
  if (!normalizedContent) return null
  return `### ${label}\n${normalizedContent}`
}

export function getListicleAiArticleTitle(draft: SingleTypeListicleDraft): string {
  return draft.title.trim() || 'Untitled listicle'
}

export function buildListicleAiArticleContext(draft: SingleTypeListicleDraft): string {
  const sections: string[] = []
  const introSection = buildSection('Intro', draft.header.introMarkdown)

  if (introSection) {
    sections.push(introSection)
  }

  draft.items.forEach((item, index) => {
    const blurbSection = buildSection(
      `Item ${index + 1}: ${LISTICLE_BLOCK_LABELS[item.blockType]}${item.item ? ` (#${item.item})` : ''}`,
      item.blurbMarkdown,
    )

    if (blurbSection) {
      sections.push(blurbSection)
    }
  })

  return sections.join('\n\n').trim()
}
