import type {
  Prompt2BlogDirectionOption,
  Prompt2BlogDirectionOptionId,
  Prompt2BlogEditorialOptionsResponse
} from '../../types/editorial.types'

interface DirectionCardsProps {
  editorialOptions: Prompt2BlogEditorialOptionsResponse
  options: readonly Prompt2BlogDirectionOption[]
  selectedOptionId: Prompt2BlogDirectionOptionId | null
  onSelect: (option: Prompt2BlogDirectionOption) => void
}

function findLabel(
  items: ReadonlyArray<{ id: string; label: string }>,
  id: string
): string {
  return items.find((item) => item.id === id)?.label ?? id
}

export function DirectionCards({
  editorialOptions,
  options,
  selectedOptionId,
  onSelect
}: DirectionCardsProps) {
  // Runtime guard still matters for restored localStorage and model JSON, even
  // though the TypeScript contract describes a three-item tuple.
  if (options.length !== 3) {
    return (
      <p
        className="p2b-commission-alert p2b-commission-alert--error"
        role="alert"
      >
        Direction import must contain exactly three options.
      </p>
    )
  }

  return (
    <fieldset className="p2b-direction-picker">
      <legend>Choose one editorial direction</legend>
      <p className="p2b-field-hint">
        Selection locks the article commission. You can edit it before research.
      </p>
      <div className="p2b-direction-grid">
        {options.map((option, index) => {
          const selected = selectedOptionId === option.option_id
          const choiceId = `p2b-${option.option_id}-choice`
          const headingId = `p2b-${option.option_id}-heading`
          const directionId = `p2b-${option.option_id}-direction`
          const formLabel = findLabel(editorialOptions.forms, option.form_id)
          const moduleLabels = option.topic_module_ids.map((id) =>
            findLabel(editorialOptions.topic_modules, id)
          )
          const audienceTagLabels = (option.audience.tags ?? []).map((id) =>
            findLabel(editorialOptions.audience_tags, id)
          )
          const scopeLabel = findLabel(
            editorialOptions.scope_modes,
            option.scope.mode
          )

          return (
            <div
              key={option.option_id}
              className={`p2b-direction-card${selected ? ' is-selected' : ''}`}
            >
              <span className="p2b-direction-card-choice">
                <input
                  id={choiceId}
                  type="radio"
                  name="p2b-editorial-direction"
                  value={option.option_id}
                  checked={selected}
                  aria-labelledby={`${choiceId}-label ${headingId} ${directionId}`}
                  onChange={() => onSelect(option)}
                />
                <label id={`${choiceId}-label`} htmlFor={choiceId}>
                  Direction {index + 1}
                </label>
              </span>
              <span className="p2b-direction-card-form" id={headingId}>
                {formLabel}
              </span>
              <span className="p2b-direction-card-direction" id={directionId}>
                {option.direction}
              </span>

              {moduleLabels.length > 0 && (
                <span
                  className="p2b-direction-card-tags"
                  aria-label="Topic modules"
                >
                  {moduleLabels.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </span>
              )}

              <dl className="p2b-direction-card-details">
                <div>
                  <dt>Audience</dt>
                  <dd>
                    {option.audience.primary_reader}
                    {audienceTagLabels.length > 0
                      ? ` · ${audienceTagLabels.join(', ')}`
                      : ''}
                  </dd>
                </div>
                <div>
                  <dt>Reader question</dt>
                  <dd>{option.core_reader_question}</dd>
                </div>
                <div>
                  <dt>Outcome</dt>
                  <dd>{option.reader_outcome}</dd>
                </div>
                <div>
                  <dt>Scope</dt>
                  <dd>
                    {scopeLabel}:{' '}
                    {option.scope.references
                      .map((reference) => {
                        const role = findLabel(
                          editorialOptions.reference_roles,
                          reference.role
                        )
                        return `${reference.name} (${role})`
                      })
                      .join(', ')}
                  </dd>
                </div>
              </dl>

              <span className="p2b-direction-card-rationale">
                <strong>Why this works</strong>
                {option.rationale}
              </span>
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}
