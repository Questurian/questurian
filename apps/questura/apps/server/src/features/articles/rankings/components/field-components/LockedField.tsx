'use client'
import { useFormFields } from '@payloadcms/ui'

type Props = {
  custom?: {
    fieldName: string
    label: string
    options?: Array<{ label: string; value: string }>
  }
}

const LockedField = ({ custom }: Props) => {
  const fieldName = custom?.fieldName
  const label = custom?.label
  const options = custom?.options

  const value = useFormFields(([fields]) => (fieldName ? fields[fieldName]?.value : '')) as string

  if (!fieldName) return null

  let displayValue = value
  if (options && value) {
    const option = options.find((o) => o.value === value)
    if (option) displayValue = option.label
  }

  return (
    <div className="field-type">
      <label className="field-label">
        {label} <span className="required">*</span>
      </label>
      <div
        style={{
          padding: '12px',
          backgroundColor: '#f8f9fa',
          border: '1px solid #e9ecef',
          borderRadius: '4px',
        }}
      >
        <span style={{ fontSize: '14px', color: '#495057', fontWeight: 500 }}>
          {displayValue || '-'}
        </span>
      </div>
    </div>
  )
}

export default LockedField

