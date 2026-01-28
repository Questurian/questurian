'use client'

import { useField, useFormFields } from '@payloadcms/ui'
import LocationPickerField from '@/shared/location/LocationPickerField'

type Props = {
  path: string
  label?: string
  required?: boolean
  field: {
    type: string
    options?: Array<{ label: string; value: string }>
    [key: string]: any
  }
}

const SmartField = (props: Props) => {
  const { path, label: propLabel, required: propRequired, field } = props
  const { value, setValue } = useField<string>({ path })

  // Fallback to field properties if props aren't provided
  const label = propLabel || field.label
  const required = propRequired !== undefined ? propRequired : field.required

  const step1Complete = useFormFields(([fields]) => fields.step1_complete?.value) as boolean
  const inUpdateMode = useFormFields(([fields]) => fields.in_update_mode?.value) as boolean
  const isLocked = step1Complete && !inUpdateMode

  // Location field uses the dedicated picker (handles locked state internally)
  if (path === 'location') {
    return (
      <LocationPickerField
        path={path}
        label={label}
        required={required}
        field={field}
      />
    )
  }

  if (isLocked) {
    let displayValue = value

    return (
      <div className="field-type">
        {label && (
          <label className="field-label">
            {label} {required && <span className="required">*</span>}
          </label>
        )}
        <div
          style={{
            padding: '12px',
            backgroundColor: 'var(--theme-elevation-50)',
            border: '1px solid var(--theme-elevation-100)',
            borderRadius: '4px',
            color: 'var(--theme-elevation-800)',
          }}
        >
          <span style={{ fontSize: '14px', fontWeight: 500 }}>
            {displayValue || '-'}
          </span>
        </div>
      </div>
    )
  }

  // Unlocked State - Render Input or Custom Component

  // Default to Text Input
  return (
    <div className="field-type">
      {label && (
        <label className="field-label">
          {label} {required && <span className="required">*</span>}
        </label>
      )}
      <input
        type="text"
        value={value || ''}
        onChange={(e) => setValue(e.target.value)}
        style={{
          width: '100%',
          padding: '12px 15px',
          border: '1px solid var(--theme-elevation-200)',
          borderRadius: '4px',
          backgroundColor: 'var(--theme-input-bg, var(--theme-elevation-0))',
          color: 'var(--theme-elevation-800)',
          fontSize: '14px',
        }}
      />
    </div>
  )
}

export default SmartField



