import type { ItineraryItemBlock, ListicleItineraryDraft } from '../../types'
import { getItineraryBlocksInArticleOrder } from '../../types'

const ITINERARY_BLOCK_LABELS: Record<ItineraryItemBlock['blockType'], string> = {
  'itinerary-dining': 'Dining',
  'itinerary-accommodations': 'Accommodations',
  'itinerary-where-staying': "Where You're Staying",
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

  getItineraryBlocksInArticleOrder(draft).forEach((item, index) => {
    const itemReferenceLabel = item.title.trim()
      ? ` (${item.title.trim()})`
      : item.item
        ? ` (#${item.item})`
        : ''
    const sectionHeading = item.blockType === 'itinerary-where-staying'
      ? `Where you're staying ${index + 1}${itemReferenceLabel}`
      : `Stop ${index + 1}: ${ITINERARY_BLOCK_LABELS[item.blockType]}${itemReferenceLabel}`
    const blurbSection = buildSection(
      sectionHeading,
      item.blurbMarkdown,
    )

    if (blurbSection) {
      sections.push(blurbSection)
    }
  })

  return sections.join('\n\n').trim()
}
