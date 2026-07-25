import type { MediaSetHealth } from '../types'

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
