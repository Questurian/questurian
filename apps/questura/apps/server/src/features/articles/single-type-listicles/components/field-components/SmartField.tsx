'use client'

import { useField, useFormFields } from '@payloadcms/ui'

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
  const { value, setValue } = useField<any>({ path })

  const label = propLabel || field.label
  const required = propRequired !== undefined ? propRequired : field.required

  const step1Complete = useFormFields(([fields]) => fields.step1_complete?.value) as boolean
  const inUpdateMode = useFormFields(([fields]) => fields.in_update_mode?.value) as boolean
  const isLocked = step1Complete && !inUpdateMode

  if (isLocked) {
    let displayValue = value
    if (field.type === 'select' && field.options) {
      const option = field.options.find((o) => o.value === value)
      if (option) displayValue = option.label
    }

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
          <span style={{ fontSize: '14px', fontWeight: 500 }}>{displayValue ?? '-'}</span>
        </div>
      </div>
    )
  }

  if (field.type === 'select') {
    return (
      <div className="field-type">
        {label && (
          <label className="field-label">
            {label} {required && <span className="required">*</span>}
          </label>
        )}
        <div className="select-container" style={{ position: 'relative' }}>
          <select
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
              appearance: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="" disabled>
              Select a value
            </option>
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    )
  }

  if (field.type === 'number') {
    return (
      <div className="field-type">
        {label && (
          <label className="field-label">
            {label} {required && <span className="required">*</span>}
          </label>
        )}
        <input
          type="number"
          value={typeof value === 'number' ? value : ''}
          min={field.min}
          max={field.max}
          onChange={(e) => {
            const next = e.target.value
            setValue(next === '' ? null : Number(next))
          }}
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
