type LabeledTextEditorialBlockEditorProps = {
  label: string
  labelPlaceholder: string
  text: string
  textLabel: string
  textPlaceholder: string
  rows: number
  buildMarkdown: (label: string, text: string) => string
  onChangeMarkdown: (nextMarkdown: string) => void
}

export function LabeledTextEditorialBlockEditor({
  label,
  labelPlaceholder,
  text,
  textLabel,
  textPlaceholder,
  rows,
  buildMarkdown,
  onChangeMarkdown,
}: LabeledTextEditorialBlockEditorProps) {
  return (
    <>
      <div className="editorial-field-group">
        <label className="editorial-field-label">Label</label>
        <input
          type="text"
          className="editorial-field-input"
          value={label}
          onChange={(event) => onChangeMarkdown(buildMarkdown(event.target.value, text))}
          placeholder={labelPlaceholder}
        />
      </div>

      <div className="editorial-field-group">
        <label className="editorial-field-label">{textLabel}</label>
        <textarea
          className="editorial-field-textarea"
          value={text}
          onChange={(event) => onChangeMarkdown(buildMarkdown(label, event.target.value))}
          rows={rows}
          placeholder={textPlaceholder}
        />
      </div>
    </>
  )
}
