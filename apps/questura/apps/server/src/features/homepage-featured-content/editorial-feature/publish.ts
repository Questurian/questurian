function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readyImage(value: unknown): boolean {
  return isRecord(value) && value.status === 'ready' && text(value.url) !== ''
}

export function getEditorialFeaturePublishBlockers(
  block: Record<string, unknown>,
  blockIndex: number,
): string[] {
  const prefix = `Block ${blockIndex + 1}`
  const blockers: string[] = []
  if (!text(block.featureKicker)) blockers.push(`${prefix} is missing its Feature kicker.`)
  if (!text(block.featureTitle)) blockers.push(`${prefix} is missing its feature title.`)
  if (!text(block.featureDescription)) blockers.push(`${prefix} is missing its feature description.`)
  if (!readyImage(block.featureImagePortrait)) {
    blockers.push(`${prefix} feature image is missing a ready portrait placement.`)
  }
  if (!readyImage(block.featureImageWide)) {
    blockers.push(`${prefix} feature image is missing a ready wide placement.`)
  }
  if (block.featureImageAltReady !== true) {
    blockers.push(`${prefix} feature image is missing authored alt text.`)
  }
  return blockers
}
