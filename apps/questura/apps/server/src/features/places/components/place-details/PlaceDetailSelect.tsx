import type { PlaceDetailConfig } from '../../types/placeDetails'
import styles from './place-details.module.css'

type PlaceDetailSelectProps = {
  config: PlaceDetailConfig
  value: string
  onChange: (value: string) => void
}

export const PlaceDetailSelect = ({ config, value, onChange }: PlaceDetailSelectProps) => (
  <div className={styles.control}>
    <label className={styles.label} htmlFor={config.fieldName}>
      {config.label}
    </label>
    <select
      id={config.fieldName}
      className={styles.select}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Select type...</option>
      {config.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
)
