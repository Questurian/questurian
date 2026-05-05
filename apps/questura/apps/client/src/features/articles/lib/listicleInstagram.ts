import type { ListicleItemRow } from '@/features/articles/types/mapsListicle'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** HTML embed from the list row’s selected Instagram post (public API populated). */
export function listicleInstagramEmbedCode(
  row: ListicleItemRow,
): string | null {
  const raw = row.selectedInstagramPost
  if (!isRecord(raw)) {
    return null
  }
  const code = raw.embedCode
  return typeof code === 'string' && code.trim().length > 0 ? code : null
}
