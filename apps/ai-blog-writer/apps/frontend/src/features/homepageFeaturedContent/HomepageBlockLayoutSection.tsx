import type { ReactNode } from 'react'

type Option<T extends string> = {
  value: T
  label: ReactNode
}

type Props<T extends string> = {
  title: string
  hint: ReactNode
  name: string
  ariaLabel: string
  value: T
  options: Option<T>[]
  /** Optional; callers that never disable this control may omit it. */
  disabled?: boolean
  dirty: boolean
  isPending: boolean
  error: unknown
  onChange: (value: T) => void
  onReset: () => void
  onSave: () => void
}

export default function HomepageBlockLayoutSection<T extends string>({
  title,
  hint,
  name,
  ariaLabel,
  value,
  options,
  disabled = false,
  dirty,
  isPending,
  error,
  onChange,
  onReset,
  onSave,
}: Props<T>) {
  return (
    <section className="hf-block-settings-section">
      <h3 className="hf-block-settings-kicker">{title}</h3>
      <p className="hf-block-settings-hint">{hint}</p>
      <div className="hf-slot3-layout-options" role="radiogroup" aria-label={ariaLabel}>
        {options.map((option) => (
          <label className="hf-slot3-layout-label" key={option.value}>
            <input
              type="radio"
              name={name}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              disabled={disabled || isPending}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <div className="hf-block-section-heading-row">
        <button
          type="button"
          className="hf-btn-ghost"
          disabled={disabled || !dirty || isPending}
          onClick={onReset}
        >
          Reset
        </button>
        <button
          type="button"
          className="hf-btn-primary"
          disabled={disabled || !dirty || isPending}
          onClick={onSave}
        >
          {isPending ? 'Saving…' : 'Save layout'}
        </button>
      </div>
      {error ? (
        <p className="hf-block-section-heading-error">
          {error instanceof Error ? error.message : 'Failed to save layout.'}
        </p>
      ) : null}
    </section>
  )
}
