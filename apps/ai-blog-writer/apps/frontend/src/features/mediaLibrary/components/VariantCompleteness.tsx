import { ALL_VARIANT_KEYS } from '../types'
import type { MediaSetHealth } from '../types'

type Props = { health: MediaSetHealth }

const VARIANT_LABELS: Record<string, string> = {
  thumbnail: 'TH',
  square: 'SQ',
  wide: 'WD',
  portrait: 'PT',
  hero: 'HR',
  open_graph: 'OG',
  editorial: 'ED',
}

export function VariantCompleteness({ health }: Props) {
  return (
    <div className="ml-variant-row" title="Variant completeness">
      {ALL_VARIANT_KEYS.map((k) => {
        const present = health.presentVariants.includes(k)
        return (
          <span
            key={k}
            className={`ml-variant-chip ${present ? 'present' : 'missing'}`}
            title={`${k}: ${present ? 'present' : 'missing'}`}
          >
            {VARIANT_LABELS[k]}
          </span>
        )
      })}
    </div>
  )
}
