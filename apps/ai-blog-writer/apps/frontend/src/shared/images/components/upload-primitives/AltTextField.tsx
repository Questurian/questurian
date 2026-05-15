type AltTextFieldProps = {
  value: string
  isGenerating: boolean
  disabled?: boolean
  onChange: (value: string) => void
  onRegenerate: () => void
}

export function AltTextField({
  value,
  isGenerating,
  disabled = false,
  onChange,
  onRegenerate,
}: AltTextFieldProps) {
  return (
    <div className="iu-alt-field">
      <div className="iu-alt-field__label-row">
        <label className="iu-alt-field__label">Alt text</label>
        {isGenerating && (
          <span className="iu-alt-field__generating">
            <svg className="iu-alt-field__spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
              <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
              <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
              <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
            </svg>
            Generating with AI…
          </span>
        )}
      </div>
      <textarea
        className="iu-alt-field__textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isGenerating ? 'Generating…' : 'Describe the image for accessibility'}
        disabled={isGenerating || disabled}
        rows={3}
      />
      <button
        type="button"
        className="iu-alt-field__regen"
        onClick={onRegenerate}
        disabled={isGenerating || disabled}
      >
        Regenerate with AI
      </button>
    </div>
  )
}
