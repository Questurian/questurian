export const MAX_PAGE_SIZE = 50
export const DEFAULT_PAGE_SIZE = 20
export const MAX_QUERY_LENGTH = 160

export function normalizeQuery(raw: string | null): string {
  return (raw ?? '').trim().replace(/\s+/g, ' ')
}

export function clampPageSize(raw: string | null): number {
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 1) return DEFAULT_PAGE_SIZE
  return Math.min(Math.floor(value), MAX_PAGE_SIZE)
}

export function clampPage(raw: string | null): number {
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 1) return 1
  return Math.floor(value)
}
