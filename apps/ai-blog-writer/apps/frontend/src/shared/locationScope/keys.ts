const normalizeSegment = (segment: string): string => segment.trim().toLowerCase()

export const normalizeLocationKey = (locationKey: string): string =>
  locationKey
    .trim()
    .toLowerCase()
    .split('|')
    .map(normalizeSegment)
    .filter(Boolean)
    .join('|')

export const parseLocationKey = (locationKey: string): string[] => {
  const normalized = normalizeLocationKey(locationKey)
  if (!normalized) return []
  return normalized.split('|')
}
