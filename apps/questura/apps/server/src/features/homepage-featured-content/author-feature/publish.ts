function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readyImage(value: unknown): boolean {
  return isRecord(value) && value.status === 'ready' && text(value.url) !== ''
}

function numericId(value: unknown): number | null {
  const raw = isRecord(value) ? value.id : value
  const parsed = typeof raw === 'number' ? raw : Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export function getAuthorFeaturePublishBlockers(
  block: Record<string, unknown>,
  blockIndex: number,
): string[] {
  const prefix = `Block ${blockIndex + 1}`
  const card = isRecord(block.authorCard) ? block.authorCard : null
  const blockers: string[] = []

  if (!card) {
    blockers.push(`${prefix} is missing its Author.`)
  } else {
    if (!isRecord(card.author) || !text(card.author.href)) {
      blockers.push(`${prefix} Author is missing a public Author page.`)
    }
    if (!readyImage(card.image)) {
      blockers.push(`${prefix} Author image is missing a ready portrait placement.`)
    }
    if (!readyImage(card.imageSquare)) {
      blockers.push(`${prefix} Author image is missing a ready square placement.`)
    }
    if (card.imageAltReady !== true) {
      blockers.push(`${prefix} Author image is missing authored alt text.`)
    }
  }

  const authorId = card ? numericId(card.author) : null
  const selection = isRecord(block.selection) ? block.selection : null
  const items = selection && Array.isArray(selection.items) ? selection.items : []
  if (authorId && items.some((item) => !isRecord(item) || numericId(item.author) !== authorId)) {
    blockers.push(`${prefix} contains an article not written by its selected Author.`)
  }

  return blockers
}
