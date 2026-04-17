import type { SingleTypeListicleDraft } from '../../types'

export function validateStep1(current: SingleTypeListicleDraft): string[] {
  const issues: string[] = []
  if (!current.title.trim()) issues.push('Title is required')
  if (!current.location.trim()) issues.push('Location is required')
  if (!current.listicleType) issues.push('Listicle data type is required')
  if (!Number.isFinite(current.targetItemCount) || current.targetItemCount < 1 || current.targetItemCount > 50) {
    issues.push('Target list size must be between 1 and 50')
  }
  return issues
}
