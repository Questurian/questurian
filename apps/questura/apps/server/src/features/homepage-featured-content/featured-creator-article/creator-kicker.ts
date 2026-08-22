export const CREATOR_KICKER_MAX_LENGTH = 80

type ParseCreatorKickerResult =
  | { ok: true; omit: true }
  | { ok: true; omit: false; value: string | null }
  | { ok: false; message: string }

export function parseCreatorKickerBodyField(
  body: Record<string, unknown>,
): ParseCreatorKickerResult {
  if (!Object.prototype.hasOwnProperty.call(body, 'creatorKicker')) {
    return { ok: true, omit: true }
  }

  const value = body.creatorKicker
  if (value !== null && typeof value !== 'string') {
    return { ok: false, message: 'creatorKicker must be a string or null.' }
  }

  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (trimmed.length > CREATOR_KICKER_MAX_LENGTH) {
    return {
      ok: false,
      message: `creatorKicker must be ${CREATOR_KICKER_MAX_LENGTH} characters or fewer.`,
    }
  }

  return { ok: true, omit: false, value: trimmed || null }
}

export function publicCreatorKicker(block: { creatorKicker?: unknown }): string | null {
  const value = block.creatorKicker
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, CREATOR_KICKER_MAX_LENGTH) : null
}
