import type {
  LocationFieldDefinition,
  LocationIndexRow,
  LocationLevel,
  LocationOption,
  MediaSetOption,
  ScalarFieldDefinition,
} from './types'

type PathSegment = string | number

export function cloneValue<T>(value: T): T {
  return structuredClone(value)
}

function normalizePath(path: string | Array<string | number>): PathSegment[] {
  if (Array.isArray(path)) {
    return path.map((segment) => {
      if (typeof segment === 'number') return segment
      return /^\d+$/.test(segment) ? Number(segment) : segment
    })
  }

  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
    .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment))
}

export function getValueAtPath<T>(value: T, path: string | Array<string | number>): unknown {
  return normalizePath(path).reduce<unknown>((current, segment) => {
    if (current === null || current === undefined) return undefined
    if (typeof segment === 'number' && Array.isArray(current)) {
      return current[segment]
    }
    if (typeof segment === 'string' && typeof current === 'object') {
      return (current as Record<string, unknown>)[segment]
    }
    return undefined
  }, value)
}

export function setValueAtPath<T extends object>(
  value: T,
  path: string | Array<string | number>,
  nextValue: unknown,
): T {
  const result = cloneValue(value)
  const segments = normalizePath(path)

  if (!segments.length) return result

  let current: unknown = result
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]
    const nextSegment = segments[index + 1]

    if (typeof segment === 'number') {
      if (!Array.isArray(current)) {
        throw new Error(`Path ${path} does not resolve to an array`)
      }
      if (current[segment] === undefined) {
        current[segment] = typeof nextSegment === 'number' ? [] : {}
      }
      current = current[segment]
      continue
    }

    if (typeof current !== 'object' || current === null) {
      throw new Error(`Path ${path} does not resolve to an object`)
    }

    const record = current as Record<string, unknown>
    if (record[segment] === undefined || record[segment] === null) {
      record[segment] = typeof nextSegment === 'number' ? [] : {}
    }
    current = record[segment]
  }

  const finalSegment = segments[segments.length - 1]
  if (typeof finalSegment === 'number') {
    if (!Array.isArray(current)) {
      throw new Error(`Path ${path} does not resolve to an array`)
    }
    current[finalSegment] = nextValue
    return result
  }

  if (typeof current !== 'object' || current === null) {
    throw new Error(`Path ${path} does not resolve to an object`)
  }

  ;(current as Record<string, unknown>)[finalSegment] = nextValue
  return result
}

export function formatPath(path: Array<string | number>): string {
  return path.map((segment) => String(segment)).join('.')
}

export function isLocalLevel(level: LocationLevel): boolean {
  return level === 'city' || level === 'neighborhood'
}

function titleCaseFromKey(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function summarizeLocationIndexRow(row: Pick<LocationIndexRow, 'level' | 'countryName' | 'cityName' | 'neighborhoodName' | 'locationKey'>): string {
  if (row.level === 'country') return row.countryName || titleCaseFromKey(row.locationKey)
  if (row.level === 'city') return row.cityName || titleCaseFromKey(row.locationKey.split('|').pop() || row.locationKey)
  return row.neighborhoodName || titleCaseFromKey(row.locationKey.split('|').pop() || row.locationKey)
}

export function formatLocationLabel(location: Pick<LocationOption, 'level' | 'countryName' | 'cityName' | 'neighborhoodName' | 'locationKey'>): string {
  const primary = summarizeLocationIndexRow({
    level: location.level,
    countryName: location.countryName,
    cityName: location.cityName,
    neighborhoodName: location.neighborhoodName,
    locationKey: location.locationKey,
  })

  if (location.level === 'country') return primary

  const segments = [location.countryName, location.cityName, location.neighborhoodName].filter(
    (value): value is string => Boolean(value?.trim()),
  )

  if (segments.length > 1) {
    return `${primary} · ${segments.join(' / ')}`
  }

  return `${primary} · ${location.locationKey}`
}

export function formatMediaSetLabel(option: Pick<MediaSetOption, 'title' | 'location' | 'alt_text'>): string {
  const parts = [option.title, option.location, option.alt_text].filter((value): value is string => Boolean(value?.trim()))
  return parts.join(' · ') || 'Untitled media set'
}

function buildScalarDefault(field: ScalarFieldDefinition): string | number | null {
  if (field.type === 'number') return null
  return ''
}

export function createDefaultObjectFromFields(fields: LocationFieldDefinition[]): Record<string, unknown> {
  const next: Record<string, unknown> = {}

  for (const field of fields) {
    if (field.type === 'group') {
      next[field.key] = createDefaultObjectFromFields(field.fields)
      continue
    }

    if (field.type === 'array') {
      next[field.key] = []
      continue
    }

    if (field.type === 'relationship') {
      next[field.key] = field.hasMany ? [] : null
      continue
    }

    next[field.key] = buildScalarDefault(field)
  }

  return next
}

function diffValues(previous: unknown, next: unknown, basePath: string, changes: string[]) {
  if (previous === next) return

  if (Array.isArray(previous) || Array.isArray(next)) {
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      changes.push(basePath)
    }
    return
  }

  if (
    previous
    && next
    && typeof previous === 'object'
    && typeof next === 'object'
  ) {
    const keys = new Set([...Object.keys(previous as Record<string, unknown>), ...Object.keys(next as Record<string, unknown>)])
    for (const key of keys) {
      diffValues(
        (previous as Record<string, unknown>)[key],
        (next as Record<string, unknown>)[key],
        basePath ? `${basePath}.${key}` : key,
        changes,
      )
    }
    return
  }

  changes.push(basePath)
}

export function diffChangedPaths<T>(previous: T, next: T): string[] {
  const changes: string[] = []
  diffValues(previous, next, '', changes)
  return changes.filter(Boolean)
}

export function mergeDefinedValues<T>(current: T, patch: Partial<T>): T {
  if (Array.isArray(current) && Array.isArray(patch)) {
    return cloneValue(patch) as T
  }

  if (
    current !== null
    && patch !== null
    && typeof current === 'object'
    && typeof patch === 'object'
    && !Array.isArray(current)
    && !Array.isArray(patch)
  ) {
    const result: Record<string, unknown> = { ...(current as Record<string, unknown>) }

    for (const [key, patchValue] of Object.entries(patch)) {
      if (patchValue === undefined) continue

      const currentValue = result[key]
      if (
        currentValue !== null
        && patchValue !== null
        && typeof currentValue === 'object'
        && typeof patchValue === 'object'
        && !Array.isArray(currentValue)
        && !Array.isArray(patchValue)
      ) {
        result[key] = mergeDefinedValues(
          currentValue as Record<string, unknown>,
          patchValue as Record<string, unknown>
        )
        continue
      }

      result[key] = cloneValue(patchValue)
    }

    return result as T
  }

  return cloneValue(patch as T)
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim().length < 1
  if (Array.isArray(value)) return value.length < 1
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length < 1
  return false
}

export function pruneEmptyValues<T>(value: T): T | undefined {
  if (Array.isArray(value)) {
    const next = value
      .map((entry) => pruneEmptyValues(entry))
      .filter((entry) => !isEmptyValue(entry))
    return (next.length ? next : undefined) as T | undefined
  }

  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {}

    for (const [key, entry] of Object.entries(value)) {
      const pruned = pruneEmptyValues(entry)
      if (isEmptyValue(pruned)) continue
      next[key] = pruned
    }

    return (Object.keys(next).length ? next : undefined) as T | undefined
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return (trimmed.length ? trimmed : undefined) as T | undefined
  }

  if (value === null || value === undefined) {
    return undefined
  }

  return value
}
