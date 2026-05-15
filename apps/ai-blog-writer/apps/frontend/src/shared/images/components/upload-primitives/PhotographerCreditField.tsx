type PhotographerCreditFieldProps = {
  value: string
  disabled?: boolean
  showError?: boolean
  onChange: (value: string) => void
}

export function PhotographerCreditField({
  value,
  disabled = false,
  showError = false,
  onChange,
}: PhotographerCreditFieldProps) {
  return (
    <div className="iu-credit-field">
      <div className="iu-credit-field__label-row">
        <label className="iu-credit-field__label">Photographer credit</label>
        <span className="iu-credit-field__required">*</span>
      </div>
      <input
        type="text"
        className="iu-credit-field__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Jane Doe / Unsplash"
        disabled={disabled}
        required
        aria-required="true"
      />
      {showError && (
        <p className="iu-credit-field__error">Photographer credit is required before upload.</p>
      )}
    </div>
  )
}
