import type { ItineraryItemBlock, ListicleItineraryDraft } from '../../types'

const ITINERARY_BLOCK_LABELS: Record<ItineraryItemBlock['blockType'], string> = {
  'itinerary-dining': 'Dining',
  'itinerary-accommodations': 'Accommodations',
  'itinerary-attractions': 'Attractions',
  'itinerary-nightlife': 'Nightlife',
  'itinerary-key-location': 'Key Location',
}

function buildSection(label: string, content: string): string | null {
  const normalizedContent = content.trim()
  if (!normalizedContent) return null
  return `### ${label}\n${normalizedContent}`
}

function buildStopTimeLabel(item: ItineraryItemBlock): string {
  const durationParts: string[] = []
  const durationMinutes = Number(item.durationMinutes)

  if (item.durationHours > 0) {
    durationParts.push(`${item.durationHours}h`)
  }
  if (durationMinutes > 0) {
    durationParts.push(`${durationMinutes}m`)
  }
  if (durationParts.length === 0) {
    durationParts.push('0m')
  }

  return `${item.timeHour}:${item.timeMinute} ${item.timePeriod} (${durationParts.join(' ')})`
}

export function getItineraryAiArticleTitle(draft: ListicleItineraryDraft): string {
  return draft.header.customTitle.trim() || draft.title.trim() || 'Untitled itinerary'
}

export function buildItineraryAiArticleContext(draft: ListicleItineraryDraft): string {
  const sections: string[] = []
  const introSection = buildSection('Intro', draft.header.introMarkdown)

  if (introSection) {
    sections.push(introSection)
  }

  draft.items.forEach((item, index) => {
    const blurbSection = buildSection(
      `Stop ${index + 1}: ${ITINERARY_BLOCK_LABELS[item.blockType]} at ${buildStopTimeLabel(item)}${item.item ? ` (#${item.item})` : ''}`,
      item.blurbMarkdown,
    )

    if (blurbSection) {
      sections.push(blurbSection)
    }
  })

  return sections.join('\n\n').trim()
}
