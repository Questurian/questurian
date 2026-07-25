import type { MediaSet } from '../../shared/api/payload/payload.types'
import { ALL_VARIANT_KEYS } from './types'
import type { MediaSetHealth } from './types'

export function computeHealth(ms: MediaSet): MediaSetHealth {
  const presentVariants = ALL_VARIANT_KEYS.filter((k) => {
    const v = ms.variants?.[k]
    return v != null && (typeof v === 'object' ? !!v.url : true)
  })
  const missingVariants = ALL_VARIANT_KEYS.filter((k) => !presentVariants.includes(k))

  const missingAltText = !ms.alt_text?.trim()
  const missingPhotographerCredit = !ms.photographer_credit?.trim()
  const missingLocation = ms.location == null
  const missingTitle = !ms.title?.trim()
  const missingSource = ms.source == null

  const checks = [
    !missingAltText,
    !missingPhotographerCredit,
    !missingLocation,
    !missingTitle,
    !missingSource,
    presentVariants.length === ALL_VARIANT_KEYS.length,
  ]
  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100)

  return {
    score,
    missingAltText,
    missingPhotographerCredit,
    missingLocation,
    missingTitle,
    missingSource,
    presentVariants,
    missingVariants,
  }
}
