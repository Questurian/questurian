import type { DetailFieldName, DetailTypeValues, PlaceDetailConfig } from '../../types/placeDetails'
import { PlaceDetailSelect } from './PlaceDetailSelect'
import styles from './place-details.module.css'

type PlaceDetailsPanelProps = {
  activeDetails: readonly PlaceDetailConfig[]
  hasSelectedCategories: boolean
  isLoadingDetails: boolean
  values: DetailTypeValues
  onChange: (fieldName: DetailFieldName, value: string) => void
}

export const PlaceDetailsPanel = ({
  activeDetails,
  hasSelectedCategories,
  isLoadingDetails,
  values,
  onChange,
}: PlaceDetailsPanelProps) => {
  if (activeDetails.length === 0) {
    return (
      <div className={styles.container}>
        <p className={styles.emptyMessage}>
          {hasSelectedCategories
            ? 'Loading category details...'
            : 'Select categories above to configure type details'}
        </p>
      </div>
    )
  }

  if (isLoadingDetails) {
    return (
      <div className={styles.container}>
        <p className={styles.loadingMessage}>Loading details...</p>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <h4 className={styles.heading}>Category Details</h4>
      <div className={styles.controls}>
        {activeDetails.map((config) => (
          <PlaceDetailSelect
            key={config.categorySlug}
            config={config}
            value={values[config.fieldName] ?? ''}
            onChange={(value) => onChange(config.fieldName, value)}
          />
        ))}
      </div>
    </div>
  )
}
