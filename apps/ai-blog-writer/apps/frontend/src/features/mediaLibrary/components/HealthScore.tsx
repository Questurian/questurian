import type { MediaSet } from '../../../shared/api/payload/payload.types'
import { ALL_VARIANT_KEYS } from '../types'
import type { MediaSetHealth } from '../types'

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

type Props = { health: MediaSetHealth; size?: 'sm' | 'md' }

export function HealthScore({ health, size = 'md' }: Props) {
  const color =
    health.score >= 80 ? '#22c55e' : health.score >= 50 ? '#f59e0b' : '#ef4444'

  const dim = size === 'sm' ? 28 : 36
  const stroke = size === 'sm' ? 3 : 4
  const r = (dim - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (health.score / 100) * circ

  return (
    <span
      className="ml-health-score"
      title={`Health: ${health.score}%`}
      style={{ width: dim, height: dim }}
    >
      <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} aria-hidden>
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={r}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={stroke}
        />
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${dim / 2} ${dim / 2})`}
        />
      </svg>
      <span className="ml-health-score-label" style={{ color, fontSize: size === 'sm' ? 9 : 11 }}>
        {health.score}
      </span>
    </span>
  )
}
