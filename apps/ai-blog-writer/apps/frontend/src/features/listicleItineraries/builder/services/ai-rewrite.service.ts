import type { ItineraryItemBlock, ListicleItineraryDraft } from '../../types'

const ITINERARY_BLOCK_LABELS: Record<ItineraryItemBlock['blockType'], string> = {
  'itinerary-dining': 'Dining',
  'itinerary-accommodations': 'Accommodations',
  'itinerary-attractions': 'Attractions',
  'itinerary-nightlife': 'Nightlife',
  'itinerary-key-location': 'Key Location',
  'itinerary-tour-agency': 'Tour Agency',
}

function buildSection(label: string, content: string): string | null {
  const normalizedContent = content.trim()
  if (!normalizedContent) return null
  return `### ${label}\n${normalizedContent}`
}

export function getItineraryAiArticleTitle(draft: ListicleItineraryDraft): string {
  return draft.title.trim() || 'Untitled itinerary'
}

export function buildItineraryAiArticleContext(draft: ListicleItineraryDraft): string {
  const sections: string[] = []
  const introSection = buildSection('Intro', draft.header.introMarkdown)

  if (introSection) {
    sections.push(introSection)
  }

  draft.items.forEach((item, index) => {
    const itemReferenceLabel = item.title.trim()
      ? ` (${item.title.trim()})`
      : item.item
        ? ` (#${item.item})`
        : ''
    const blurbSection = buildSection(
      `Stop ${index + 1}: ${ITINERARY_BLOCK_LABELS[item.blockType]}${itemReferenceLabel}`,
      item.blurbMarkdown,
    )

    if (blurbSection) {
      sections.push(blurbSection)
    }
  })

  return sections.join('\n\n').trim()
}
