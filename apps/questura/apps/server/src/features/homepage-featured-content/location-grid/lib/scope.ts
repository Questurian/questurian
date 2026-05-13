import type {
  LocationGridCandidate,
  LocationGridScope,
  LocationGridScopeLocationInput,
} from '../types'

export function isLocationWithinScope(
  candidate: Pick<LocationGridCandidate, 'level' | 'parentKey'>,
  scope: LocationGridScope | null,
): boolean {
  if (!scope) return false
  if (candidate.level !== scope.childLevel) return false

  if (scope.parentKey) {
    return candidate.parentKey === scope.parentKey
  }

  return true
}

export function resolveLocationGridScopeFromLocation(
  location: LocationGridScopeLocationInput | null | undefined,
): LocationGridScope | null {
  if (!location || location.level !== 'city') {
    return null
  }

  if (typeof location.locationKey !== 'string' || !location.locationKey.trim()) {
    return null
  }

  return {
    childLevel: 'neighborhood',
    parentKey: location.locationKey,
  }
}

export function getScopedLocationLabel(scope: LocationGridScope): string {
  return scope.childLevel === 'city' ? 'city' : 'neighborhood'
}
