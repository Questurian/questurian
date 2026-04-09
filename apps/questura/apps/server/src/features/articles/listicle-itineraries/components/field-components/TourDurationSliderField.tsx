'use client'

import React from 'react'
import { useField } from '@payloadcms/ui'

type Props = {
  path: string
  field: {
    label?: string
    min?: number
    max?: number
    required?: boolean
    admin?: {
      description?: string
    }
  }
}

const getHourLabel = (value: number): string => {
  return `${value} hour${value === 1 ? '' : 's'}`
}

const TourDurationSliderField: React.FC<Props> = ({ path, field }) => {
  const min = typeof field.min === 'number' ? field.min : 1
  const max = typeof field.max === 'number' ? field.max : 24
  const { value, setValue } = useField<number | null>({ path })

  const safeValue = typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : min

  return (
    <div className="field-type" style={{ display: 'grid', gap: '0.55rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
        <label className="field-label" htmlFor={path}>
          {field.label || 'Tour Duration'}
          {field.required ? <span className="required"> *</span> : null}
        </label>
        <span
          style={{
            border: '1px solid var(--theme-elevation-150)',
            backgroundColor: 'var(--theme-elevation-50)',
            color: 'var(--theme-text)',
            borderRadius: '999px',
            padding: '0.18rem 0.55rem',
            fontSize: '0.78rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {getHourLabel(safeValue)}
        </span>
      </div>

      <input
        id={path}
        type="range"
        min={min}
        max={max}
        step={1}
        value={safeValue}
        onChange={(event) => setValue(Number(event.target.value))}
        style={{ width: '100%', accentColor: 'var(--theme-success-500)' }}
      />

      {field.admin?.description ? (
        <p style={{ margin: 0, color: 'var(--theme-elevation-600)', fontSize: '0.82rem' }}>
          {field.admin.description}
        </p>
      ) : null}
    </div>
  )
}

export default TourDurationSliderField
