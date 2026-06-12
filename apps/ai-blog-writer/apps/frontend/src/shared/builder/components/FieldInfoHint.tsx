import { useId } from 'react'

type FieldInfoHintProps = {
  text: string
}

export function FieldInfoHint({ text }: FieldInfoHintProps) {
  const tooltipId = useId()

  return (
    <span
      className="stl-field-info-hint-wrap"
      aria-describedby={tooltipId}
      aria-label={text}
      role="img"
      tabIndex={0}
    >
      <span className="stl-field-info-hint" aria-hidden="true">
        i
      </span>
      <span className="stl-field-info-tooltip" id={tooltipId} role="tooltip">
        {text}
      </span>
    </span>
  )
}
