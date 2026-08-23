function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readyImage(value: unknown): boolean {
  return isRecord(value) && value.status === 'ready' && text(value.url) !== ''
}

export function getAuthorFeaturePublishBlockers(
  block: Record<string, unknown>,
  blockIndex: number,
): string[] {
  const prefix = `Block ${blockIndex + 1}`
  const cards = Array.isArray(block.authorCards) ? block.authorCards : []
  const blockers: string[] = []

  if (cards.length === 0) blockers.push(`${prefix} is missing Author cards.`)
  if (cards.length > 1) blockers.push(`${prefix} has more than one Author.`)

  cards.forEach((card, index) => {
    if (!isRecord(card)) {
      blockers.push(`${prefix}, Author ${index + 1} is invalid.`)
      return
    }
    if (!isRecord(card.author) || !text(card.author.href)) {
      blockers.push(`${prefix}, Author ${index + 1} is missing a public Author page.`)
    }
    if (!readyImage(card.image)) {
      blockers.push(`${prefix}, Author ${index + 1} image is missing a ready portrait placement.`)
    }
    if (!readyImage(card.imageSquare)) {
      blockers.push(`${prefix}, Author ${index + 1} image is missing a ready square placement.`)
    }
    if (card.imageAltReady !== true) {
      blockers.push(`${prefix}, Author ${index + 1} image is missing authored alt text.`)
    }
  })

  return blockers
}
