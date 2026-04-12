/**
 * Reorders a list of blocks to match `orderedBlockIds` (a permutation of existing ids).
 */
export function reorderBlocksByIds<T extends { id: string }>(
  existing: T[],
  orderedBlockIds: unknown,
): { ok: true; reordered: T[] } | { ok: false; message: string } {
  if (!Array.isArray(orderedBlockIds)) {
    return { ok: false, message: 'orderedBlockIds (array of block ids) is required.' }
  }

  if (existing.length === 0) {
    if (orderedBlockIds.length !== 0) {
      return { ok: false, message: 'orderedBlockIds must be empty when there are no blocks.' }
    }
    return { ok: true, reordered: [] }
  }

  if (orderedBlockIds.length !== existing.length) {
    return {
      ok: false,
      message: 'orderedBlockIds must include every block exactly once.',
    }
  }

  const byId = new Map(existing.map((block) => [block.id, block]))
  const seen = new Set<string>()
  const reordered: T[] = []

  for (const rawId of orderedBlockIds) {
    if (typeof rawId !== 'string' || rawId.trim().length === 0) {
      return { ok: false, message: 'Each orderedBlockIds entry must be a non-empty string.' }
    }
    if (seen.has(rawId)) {
      return { ok: false, message: 'orderedBlockIds contains duplicate ids.' }
    }
    seen.add(rawId)
    const block = byId.get(rawId)
    if (!block) {
      return { ok: false, message: `Unknown block id: ${rawId}` }
    }
    reordered.push(block)
  }

  return { ok: true, reordered }
}
