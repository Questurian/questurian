import type { LocationLevel } from './locationGuideContract'

type PlainObject = Record<string, unknown>

export type LocationGuideValue = PlainObject | unknown[] | string | number | boolean | null | undefined

export type LocationGuideRecord = {
  media?: PlainObject | null
  core?: PlainObject | null
  explore?: PlainObject | null
  stay?: PlainObject | null
  move?: PlainObject | null
}

const isPlainObject = (value: unknown): value is PlainObject =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const hasMeaningfulLocationGuideValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.some(hasMeaningfulLocationGuideValue)
  if (isPlainObject(value)) {
    return Object.values(value).some(hasMeaningfulLocationGuideValue)
  }
  return false
}

const cloneLocationGuideValue = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => cloneLocationGuideValue(item)) as T
  }

  if (isPlainObject(value)) {
    const next: PlainObject = {}
    for (const [key, child] of Object.entries(value)) {
      next[key] = cloneLocationGuideValue(child)
    }
    return next as T
  }

  return value
}

const mergeLocationGuideValue = (
  base: LocationGuideValue,
  override: LocationGuideValue,
): LocationGuideValue => {
  if (!hasMeaningfulLocationGuideValue(override)) {
    return cloneLocationGuideValue(base)
  }

  if (!hasMeaningfulLocationGuideValue(base)) {
    return cloneLocationGuideValue(override)
  }

  if (Array.isArray(override)) {
    return cloneLocationGuideValue(override)
  }

  if (isPlainObject(base) && isPlainObject(override)) {
    const next: PlainObject = { ...cloneLocationGuideValue(base) }

    for (const [key, overrideValue] of Object.entries(override)) {
      const baseValue = next[key] as LocationGuideValue
      next[key] = mergeLocationGuideValue(baseValue, overrideValue as LocationGuideValue)
    }

    return next
  }

  return cloneLocationGuideValue(override)
}

const mergeLocationGuideLayers = (
  ...layers: Array<LocationGuideValue>
): LocationGuideValue => {
  let resolved: LocationGuideValue = undefined

  for (const layer of layers) {
    resolved = mergeLocationGuideValue(resolved, layer)
  }

  return resolved
}

const withMeaningfulSection = (
  target: PlainObject,
  key: keyof LocationGuideRecord,
  value: LocationGuideValue,
): void => {
  if (!hasMeaningfulLocationGuideValue(value)) return
  target[key] = cloneLocationGuideValue(value)
}

export const resolveLocationGuideForHierarchy = ({
  level,
  ownGuide,
  countryGuide,
  cityGuide,
}: {
  level: LocationLevel
  ownGuide?: LocationGuideRecord | null
  countryGuide?: LocationGuideRecord | null
  cityGuide?: LocationGuideRecord | null
}): PlainObject => {
  const own = ownGuide ?? {}
  const country = countryGuide ?? {}
  const city = cityGuide ?? {}
  const resolved: PlainObject = {}

  if (level === 'country') {
    withMeaningfulSection(resolved, 'media', own.media)
    return resolved
  }

  withMeaningfulSection(
    resolved,
    'media',
    mergeLocationGuideLayers(country.media, city.media, own.media),
  )

  if (level === 'city') {
    withMeaningfulSection(resolved, 'core', own.core)
    withMeaningfulSection(resolved, 'explore', own.explore)
    withMeaningfulSection(resolved, 'stay', own.stay)
    withMeaningfulSection(resolved, 'move', own.move)
    return resolved
  }

  withMeaningfulSection(resolved, 'core', mergeLocationGuideLayers(city.core, own.core))
  withMeaningfulSection(
    resolved,
    'explore',
    mergeLocationGuideLayers(city.explore, own.explore),
  )
  withMeaningfulSection(resolved, 'stay', mergeLocationGuideLayers(city.stay, own.stay))
  withMeaningfulSection(resolved, 'move', mergeLocationGuideLayers(city.move, own.move))

  return resolved
}
