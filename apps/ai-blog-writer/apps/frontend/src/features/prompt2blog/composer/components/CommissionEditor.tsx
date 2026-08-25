import { useId } from 'react'
import type {
  Prompt2BlogCommissionDraft,
  Prompt2BlogCommissionReference,
  Prompt2BlogEditorialOptionsResponse,
  Prompt2BlogReferenceRole
} from '../../types/editorial.types'
import { validateCommissionDraft } from '../commission'

interface CommissionEditorProps {
  draft: Prompt2BlogCommissionDraft
  editorialOptions: Prompt2BlogEditorialOptionsResponse
  isApproved: boolean
  onApprove?: () => void
  onChange: (draft: Prompt2BlogCommissionDraft) => void
}

function nextRequirementId(draft: Prompt2BlogCommissionDraft): string {
  const used = new Set(draft.requirements.map((item) => item.requirement_id))
  let index = draft.requirements.length + 1
  while (used.has(`r${index}`)) index += 1
  return `r${index}`
}

export function CommissionEditor({
  draft,
  editorialOptions,
  isApproved,
  onApprove,
  onChange
}: CommissionEditorProps) {
  const idPrefix = useId().replace(/:/g, '')
  const moduleIds = draft.topic_module_ids ?? []
  const audienceTags = draft.audience.tags ?? []
  const issues = [
    ...new Set(
      validateCommissionDraft(draft, editorialOptions).map(
        (issue) => issue.message
      )
    )
  ]
  const primaryReference = draft.scope.references.find(
    (reference) => reference.role === 'primary_subject'
  )
  const secondaryReferences = draft.scope.references.filter(
    (reference) => reference.role !== 'primary_subject'
  )
  const secondaryRoles = editorialOptions.reference_roles.filter(
    (option) => option.id !== 'primary_subject'
  )

  const update = (patch: Partial<Prompt2BlogCommissionDraft>) => {
    onChange({ ...draft, ...patch })
  }

  const updatePrimarySubject = (value: string) => {
    update({
      primary_subject: value,
      scope: {
        ...draft.scope,
        references: draft.scope.references.map((reference) =>
          reference.role === 'primary_subject'
            ? { ...reference, name: value }
            : reference
        )
      }
    })
  }

  const updateSecondaryReferences = (
    references: Prompt2BlogCommissionReference[]
  ) => {
    update({
      scope: {
        ...draft.scope,
        references: primaryReference
          ? [primaryReference, ...references]
          : references
      }
    })
  }

  return (
    <section
      className="p2b-commission-editor"
      aria-labelledby={`${idPrefix}-heading`}
    >
      <div className="p2b-commission-editor-header">
        <div>
          <p className="p2b-eyebrow">Approved direction</p>
          <h3 id={`${idPrefix}-heading`}>Edit the commission</h3>
          <p>Research will be locked to these choices.</p>
        </div>
        <span
          className={`p2b-commission-status${isApproved ? ' is-approved' : ''}`}
          role="status"
        >
          {isApproved ? 'Approved' : 'Needs approval'}
        </span>
      </div>

      <fieldset className="p2b-commission-fieldset">
        <legend>Locked setup</legend>
        <div className="p2b-field-row p2b-field-row--2">
          <div className="p2b-field">
            <label htmlFor={`${idPrefix}-title`}>Original title</label>
            <input
              id={`${idPrefix}-title`}
              className="p2b-input"
              value={draft.original_title}
              readOnly
            />
          </div>
          <div className="p2b-field">
            <label htmlFor={`${idPrefix}-location`}>Location</label>
            <input
              id={`${idPrefix}-location`}
              className="p2b-input"
              value={draft.location}
              readOnly
            />
          </div>
        </div>
      </fieldset>

      <div className="p2b-field">
        <label htmlFor={`${idPrefix}-direction`}>Approved direction</label>
        <textarea
          id={`${idPrefix}-direction`}
          className="p2b-textarea"
          rows={3}
          value={draft.approved_direction}
          onChange={(event) =>
            update({ approved_direction: event.target.value })
          }
        />
      </div>

      <div className="p2b-field">
        <label htmlFor={`${idPrefix}-form`}>Article form</label>
        <select
          id={`${idPrefix}-form`}
          className="p2b-select"
          value={draft.form_id}
          onChange={(event) =>
            update({
              form_id: event.target
                .value as Prompt2BlogCommissionDraft['form_id']
            })
          }
        >
          {editorialOptions.forms.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="p2b-commission-fieldset">
        <legend>Topic modules</legend>
        <p className="p2b-field-hint">
          Choose up to four. Modules constrain facts, not structure.
        </p>
        <div className="p2b-commission-checkbox-grid">
          {editorialOptions.topic_modules.map((option) => {
            const checked = moduleIds.includes(option.id)
            return (
              <label key={option.id} className="p2b-commission-checkbox">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && moduleIds.length >= 4}
                  onChange={() =>
                    update({
                      topic_module_ids: checked
                        ? moduleIds.filter((id) => id !== option.id)
                        : [...moduleIds, option.id]
                    })
                  }
                />
                <span>
                  <strong>{option.label}</strong>
                  {option.description}
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <fieldset className="p2b-commission-fieldset">
        <legend>Audience</legend>
        <div className="p2b-field">
          <label htmlFor={`${idPrefix}-audience`}>Primary audience</label>
          <input
            id={`${idPrefix}-audience`}
            className="p2b-input"
            value={draft.audience.primary_reader}
            onChange={(event) =>
              update({
                audience: {
                  ...draft.audience,
                  primary_reader: event.target.value
                }
              })
            }
          />
        </div>
        <div className="p2b-commission-checkbox-grid p2b-commission-checkbox-grid--compact">
          {editorialOptions.audience_tags.map((option) => {
            const checked = audienceTags.includes(option.id)
            return (
              <label key={option.id} className="p2b-commission-checkbox">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    update({
                      audience: {
                        ...draft.audience,
                        tags: checked
                          ? audienceTags.filter((id) => id !== option.id)
                          : [...audienceTags, option.id]
                      }
                    })
                  }
                />
                <span>
                  <strong>{option.label}</strong>
                  {option.description}
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="p2b-field-row p2b-field-row--2">
        <div className="p2b-field">
          <label htmlFor={`${idPrefix}-question`}>Core reader question</label>
          <textarea
            id={`${idPrefix}-question`}
            className="p2b-textarea"
            rows={3}
            value={draft.core_reader_question}
            onChange={(event) =>
              update({ core_reader_question: event.target.value })
            }
          />
        </div>
        <div className="p2b-field">
          <label htmlFor={`${idPrefix}-outcome`}>Reader outcome</label>
          <textarea
            id={`${idPrefix}-outcome`}
            className="p2b-textarea"
            rows={3}
            value={draft.reader_outcome}
            onChange={(event) => update({ reader_outcome: event.target.value })}
          />
        </div>
      </div>

      <fieldset className="p2b-commission-fieldset">
        <legend>Subject and scope</legend>
        <div className="p2b-field-row p2b-field-row--2">
          <div className="p2b-field">
            <label htmlFor={`${idPrefix}-subject`}>Primary subject</label>
            <input
              id={`${idPrefix}-subject`}
              className="p2b-input"
              value={draft.primary_subject}
              onChange={(event) => updatePrimarySubject(event.target.value)}
            />
            <p className="p2b-field-hint">
              Primary reference stays synced to this field.
            </p>
          </div>
          <div className="p2b-field">
            <label htmlFor={`${idPrefix}-scope-mode`}>Scope mode</label>
            <select
              id={`${idPrefix}-scope-mode`}
              className="p2b-select"
              value={draft.scope.mode}
              onChange={(event) =>
                update({
                  scope: {
                    ...draft.scope,
                    mode: event.target
                      .value as Prompt2BlogCommissionDraft['scope']['mode']
                  }
                })
              }
            >
              {editorialOptions.scope_modes.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="p2b-reference-list" aria-label="Named references">
          <div className="p2b-reference-row p2b-reference-row--primary">
            <div className="p2b-field">
              <label htmlFor={`${idPrefix}-primary-reference`}>
                Primary reference
              </label>
              <input
                id={`${idPrefix}-primary-reference`}
                className="p2b-input"
                value={primaryReference?.name ?? ''}
                readOnly
              />
            </div>
            <div className="p2b-field">
              <label htmlFor={`${idPrefix}-primary-role`}>Role</label>
              <select
                id={`${idPrefix}-primary-role`}
                className="p2b-select"
                value="primary_subject"
                disabled
              >
                <option value="primary_subject">Primary subject</option>
              </select>
            </div>
          </div>

          {secondaryReferences.map((reference, index) => (
            <div className="p2b-reference-row" key={`reference-${index}`}>
              <div className="p2b-field">
                <label htmlFor={`${idPrefix}-reference-${index}`}>
                  Reference {index + 1}
                </label>
                <input
                  id={`${idPrefix}-reference-${index}`}
                  className="p2b-input"
                  value={reference.name}
                  onChange={(event) =>
                    updateSecondaryReferences(
                      secondaryReferences.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, name: event.target.value }
                          : item
                      )
                    )
                  }
                />
              </div>
              <div className="p2b-field">
                <label htmlFor={`${idPrefix}-reference-role-${index}`}>
                  Reference {index + 1} role
                </label>
                <select
                  id={`${idPrefix}-reference-role-${index}`}
                  className="p2b-select"
                  value={reference.role}
                  onChange={(event) =>
                    updateSecondaryReferences(
                      secondaryReferences.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              role: event.target
                                .value as Prompt2BlogReferenceRole
                            }
                          : item
                      )
                    )
                  }
                >
                  {secondaryRoles.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="p2b-reference-remove"
                aria-label={`Remove reference ${index + 1}`}
                onClick={() =>
                  updateSecondaryReferences(
                    secondaryReferences.filter(
                      (_, itemIndex) => itemIndex !== index
                    )
                  )
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="p2b-add-blob-btn"
          onClick={() =>
            updateSecondaryReferences([
              ...secondaryReferences,
              { name: '', role: 'context_only' }
            ])
          }
        >
          Add named reference
        </button>
      </fieldset>

      <fieldset className="p2b-commission-fieldset">
        <legend>Research requirements</legend>
        <div className="p2b-requirement-list">
          {draft.requirements.map((requirement, index) => (
            <div className="p2b-requirement-row" key={`requirement-${index}`}>
              <div className="p2b-field p2b-requirement-id">
                <label htmlFor={`${idPrefix}-requirement-id-${index}`}>
                  Requirement {index + 1} ID
                </label>
                <input
                  id={`${idPrefix}-requirement-id-${index}`}
                  className="p2b-input"
                  value={requirement.requirement_id}
                  onChange={(event) =>
                    update({
                      requirements: draft.requirements.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, requirement_id: event.target.value }
                          : item
                      )
                    })
                  }
                />
              </div>
              <div className="p2b-field">
                <label htmlFor={`${idPrefix}-requirement-question-${index}`}>
                  Requirement {index + 1} question
                </label>
                <input
                  id={`${idPrefix}-requirement-question-${index}`}
                  className="p2b-input"
                  value={requirement.question}
                  onChange={(event) =>
                    update({
                      requirements: draft.requirements.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, question: event.target.value }
                          : item
                      )
                    })
                  }
                />
              </div>
              <button
                type="button"
                className="p2b-reference-remove"
                aria-label={`Remove requirement ${index + 1}`}
                onClick={() =>
                  update({
                    requirements: draft.requirements.filter(
                      (_, itemIndex) => itemIndex !== index
                    )
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="p2b-add-blob-btn"
          onClick={() =>
            update({
              requirements: [
                ...draft.requirements,
                { requirement_id: nextRequirementId(draft), question: '' }
              ]
            })
          }
        >
          Add research requirement
        </button>
      </fieldset>

      <div className="p2b-field">
        <label htmlFor={`${idPrefix}-exclusions`}>
          Exclusions (one per line)
        </label>
        <textarea
          id={`${idPrefix}-exclusions`}
          className="p2b-textarea"
          rows={3}
          value={(draft.exclusions ?? []).join('\n')}
          onChange={(event) =>
            update({ exclusions: event.target.value.split('\n') })
          }
        />
      </div>

      <div className="p2b-field">
        <label htmlFor={`${idPrefix}-cta`}>Call to action (optional)</label>
        <input
          id={`${idPrefix}-cta`}
          className="p2b-input"
          value={draft.call_to_action ?? ''}
          onChange={(event) =>
            update({ call_to_action: event.target.value || null })
          }
        />
      </div>

      {issues.length > 0 && (
        <div
          className="p2b-commission-alert p2b-commission-alert--error"
          role="alert"
        >
          <strong>Commission needs attention.</strong>
          <ul>
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {onApprove && (
        <div className="p2b-panel-actions">
          <button
            type="button"
            className="p2b-submit-btn"
            disabled={issues.length > 0 || isApproved}
            onClick={onApprove}
          >
            {isApproved ? 'Commission approved' : 'Approve commission'}
          </button>
        </div>
      )}
    </section>
  )
}
