export const LOCATION_GRID_MEDIA_ASPECT_VALUES = ['rectangle', 'square', 'portrait'] as const

export type LocationGridMediaAspect = (typeof LOCATION_GRID_MEDIA_ASPECT_VALUES)[number]

export function normalizeLocationGridMediaAspect(raw: unknown): LocationGridMediaAspect {
  if (raw === 'square' || raw === 'portrait' || raw === 'rectangle') return raw
  return 'rectangle'
}

export function publicLocationGridMediaAspect(block: { mediaAspect?: unknown }): LocationGridMediaAspect {
  return normalizeLocationGridMediaAspect(block.mediaAspect)
}

type MediaAspectParseResult =
  | { ok: true; omit: true }
  | { ok: true; omit: false; value: LocationGridMediaAspect }
  | { ok: false; message: string }

/**
 * Reads `mediaAspect` from JSON body. `omit` when key absent.
 */
export function parseLocationGridMediaAspectBodyField(
  body: Record<string, unknown>,
): MediaAspectParseResult {
  if (!Object.prototype.hasOwnProperty.call(body, 'mediaAspect')) {
    return { ok: true, omit: true }
  }

  const v = body.mediaAspect
  if (v === null) {
    return { ok: true, omit: false, value: 'rectangle' }
  }
  if (typeof v !== 'string') {
    return { ok: false, message: 'mediaAspect must be a string.' }
  }

  if (!(LOCATION_GRID_MEDIA_ASPECT_VALUES as readonly string[]).includes(v)) {
    return {
      ok: false,
      message: `mediaAspect must be one of: ${LOCATION_GRID_MEDIA_ASPECT_VALUES.join(', ')}.`,
    }
  }

  return { ok: true, omit: false, value: v as LocationGridMediaAspect }
}
