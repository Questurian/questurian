import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ALLOWED_VARIATION_OPTIONS,
  CAMERA_PRESET_GROUPS,
  CAPTURE_STYLE_OPTIONS,
  CROWD_CHARACTER_OPTIONS,
  DEFAULT_IMAGE_RECREATION_FORM_STATE,
  DEFAULT_PROMPT_PRESET_ID,
  ENVIRONMENT_ENHANCEMENT_OPTIONS,
  FILTER_LOOK_GROUPS,
  IMAGE_RECREATION_PROMPTS_STORAGE_KEY,
  isKnownPresetId,
  LENS_PRESET_GROUPS,
  LIGHTING_OPTIONS,
  PEOPLE_HANDLING_OPTIONS,
  PEOPLE_PRESENCE_MAP,
  PEOPLE_PRESENCE_OPTIONS,
  PRESERVATION_STRENGTH_OPTIONS,
  PRIMARY_SUBJECT_OPTIONS,
  PROMPT_PRESETS,
  SCENE_CATEGORY_MAP,
  SCENE_CATEGORY_OPTIONS,
  VALID_ALLOWED_VARIATION_IDS,
  VALID_CAMERA_PRESET_IDS,
  VALID_CAPTURE_STYLE_IDS,
  VALID_CROWD_CHARACTER_IDS,
  VALID_ENVIRONMENT_ENHANCEMENT_IDS,
  VALID_FILTER_LOOK_IDS,
  VALID_LENS_PRESET_IDS,
  VALID_LIGHTING_IDS,
  VALID_PEOPLE_HANDLING_IDS,
  VALID_PEOPLE_PRESENCE_IDS,
  VALID_PRESERVATION_STRENGTH_IDS,
  VALID_PRIMARY_SUBJECT_IDS,
  VALID_SCENE_CATEGORY_IDS,
  VALID_SHOT_PERSPECTIVE_IDS,
  SHOT_PERSPECTIVE_OPTIONS,
  VINTAGE_COMBO_NOTES,
  createFormStateFromPreset,
} from './config'
import { buildImageRecreationPrompt } from './promptBuilder'
import type {
  FilterLookId,
  ImageRecreationFormState,
  OptionGroup,
  AllowedVariationId,
  PeopleHandlingId,
  PrimarySubjectEmphasisId,
  PromptPresetId,
  SelectOption,
} from './types'
import './styles.css'

const LEGACY_PEOPLE_HANDLING_ID_MAP: Record<string, PeopleHandlingId> = {
  'preserve-exactly': 'keep-every-person-as-is',
  'preserve-count-minor-natural-changes': 'keep-same-people-small-natural-changes',
  'preserve-scene-subtle-reshuffling': 'keep-same-people-small-repositioning',
  'keep-people-secondary': 'people-secondary-environment-primary',
  'keep-environment-primary': 'environment-dominant-with-people',
}

const LEGACY_FILTER_LOOK_ID_MAP: Record<string, FilterLookId> = {
  'kodak-ekta-100': 'kodak-ektar-100',
}

const PEOPLE_FREE_HANDLING_IDS = new Set<PeopleHandlingId>([
  'keep-every-person-as-is',
  'remove-all-people',
])

const PEOPLE_DEPENDENT_VARIATION_FALLBACK: AllowedVariationId = 'small-environmental-cleanup'
const PEOPLE_FREE_PRIMARY_SUBJECT_FALLBACK: PrimarySubjectEmphasisId = 'environment-first'

function resultHasVisiblePeople(state: Pick<ImageRecreationFormState, 'peoplePresence' | 'peopleHandling'>): boolean {
  return state.peoplePresence !== 'no-people'
}

function getScenePeopleFallback(
  sceneCategory: ImageRecreationFormState['sceneCategory'],
): ImageRecreationFormState['peoplePresence'] {
  const recommendedPeoplePresence = SCENE_CATEGORY_MAP[sceneCategory].recommendedPeoplePresence

  return recommendedPeoplePresence === 'no-people' ? 'one-person' : recommendedPeoplePresence
}

function normalizeFormStateForUi(state: ImageRecreationFormState): ImageRecreationFormState {
  const nextState = { ...state }

  if (!nextState.referenceHasPeople && nextState.peopleHandling === 'remove-all-people') {
    nextState.peopleHandling = 'keep-every-person-as-is'
  }

  if (nextState.peopleHandling === 'remove-all-people') {
    nextState.peoplePresence = 'no-people'
  }

  if (
    nextState.peoplePresence === 'no-people' &&
    !PEOPLE_FREE_HANDLING_IDS.has(nextState.peopleHandling)
  ) {
    nextState.peopleHandling = nextState.referenceHasPeople
      ? 'remove-all-people'
      : 'keep-every-person-as-is'
  }

  if (!resultHasVisiblePeople(nextState)) {
    if (nextState.primarySubjectEmphasis === 'person-first') {
      nextState.primarySubjectEmphasis = PEOPLE_FREE_PRIMARY_SUBJECT_FALLBACK
    }

    if (
      nextState.allowedVariation === 'small-wardrobe-changes' ||
      nextState.allowedVariation === 'small-positional-shifts'
    ) {
      nextState.allowedVariation = PEOPLE_DEPENDENT_VARIATION_FALLBACK
    }
  }

  return nextState
}

function coerceOptionValue<TId extends string>(
  value: unknown,
  validValues: Set<TId>,
  fallback: TId,
): TId {
  return typeof value === 'string' && validValues.has(value as TId) ? (value as TId) : fallback
}

function coercePeopleHandlingValue(
  value: unknown,
  validValues: Set<PeopleHandlingId>,
  fallback: PeopleHandlingId,
): PeopleHandlingId {
  if (typeof value !== 'string') return fallback

  const migratedValue = LEGACY_PEOPLE_HANDLING_ID_MAP[value] ?? value

  return validValues.has(migratedValue as PeopleHandlingId)
    ? (migratedValue as PeopleHandlingId)
    : fallback
}

function coerceFilterLookValue(
  value: unknown,
  validValues: Set<FilterLookId>,
  fallback: FilterLookId,
): FilterLookId {
  if (typeof value !== 'string') return fallback

  const migratedValue = LEGACY_FILTER_LOOK_ID_MAP[value] ?? value

  return validValues.has(migratedValue as FilterLookId)
    ? (migratedValue as FilterLookId)
    : fallback
}

function loadSavedState(): ImageRecreationFormState {
  const fallback = DEFAULT_IMAGE_RECREATION_FORM_STATE

  try {
    const raw = localStorage.getItem(IMAGE_RECREATION_PROMPTS_STORAGE_KEY)
    if (!raw) return fallback

    const parsed = JSON.parse(raw) as Partial<ImageRecreationFormState>

    const restoredPeopleHandling = coercePeopleHandlingValue(
      parsed.peopleHandling,
      VALID_PEOPLE_HANDLING_IDS,
      fallback.peopleHandling,
    )
    const restoredPeoplePresence = coerceOptionValue(
      parsed.peoplePresence,
      VALID_PEOPLE_PRESENCE_IDS,
      fallback.peoplePresence,
    )
    const restoredReferenceHasPeople =
      typeof parsed.referenceHasPeople === 'boolean'
        ? parsed.referenceHasPeople
        : restoredPeoplePresence !== 'no-people' ||
          restoredPeopleHandling !== 'keep-every-person-as-is'

    return normalizeFormStateForUi({
      presetId: isKnownPresetId(parsed.presetId) ? parsed.presetId : fallback.presetId,
      sceneCategory: coerceOptionValue(
        parsed.sceneCategory,
        VALID_SCENE_CATEGORY_IDS,
        fallback.sceneCategory,
      ),
      referenceHasPeople: restoredReferenceHasPeople,
      peoplePresence:
        restoredPeopleHandling === 'remove-all-people' ? 'no-people' : restoredPeoplePresence,
      peopleHandling: restoredPeopleHandling,
      crowdCharacter: coerceOptionValue(
        parsed.crowdCharacter,
        VALID_CROWD_CHARACTER_IDS,
        fallback.crowdCharacter,
      ),
      primarySubjectEmphasis: coerceOptionValue(
        parsed.primarySubjectEmphasis,
        VALID_PRIMARY_SUBJECT_IDS,
        fallback.primarySubjectEmphasis,
      ),
      cameraPreset: coerceOptionValue(
        parsed.cameraPreset,
        VALID_CAMERA_PRESET_IDS,
        fallback.cameraPreset,
      ),
      lensPreset: coerceOptionValue(parsed.lensPreset, VALID_LENS_PRESET_IDS, fallback.lensPreset),
      captureStyle: coerceOptionValue(
        parsed.captureStyle,
        VALID_CAPTURE_STYLE_IDS,
        fallback.captureStyle,
      ),
      shotPerspective: coerceOptionValue(
        parsed.shotPerspective,
        VALID_SHOT_PERSPECTIVE_IDS,
        fallback.shotPerspective,
      ),
      centerMainSubject:
        typeof parsed.centerMainSubject === 'boolean'
          ? parsed.centerMainSubject
          : fallback.centerMainSubject,
      filterLook: coerceFilterLookValue(
        parsed.filterLook,
        VALID_FILTER_LOOK_IDS,
        fallback.filterLook,
      ),
      lighting: coerceOptionValue(parsed.lighting, VALID_LIGHTING_IDS, fallback.lighting),
      preservationStrength: coerceOptionValue(
        parsed.preservationStrength,
        VALID_PRESERVATION_STRENGTH_IDS,
        fallback.preservationStrength,
      ),
      allowedVariation: coerceOptionValue(
        parsed.allowedVariation,
        VALID_ALLOWED_VARIATION_IDS,
        fallback.allowedVariation,
      ),
      environmentEnhancement: coerceOptionValue(
        parsed.environmentEnhancement,
        VALID_ENVIRONMENT_ENHANCEMENT_IDS,
        fallback.environmentEnhancement,
      ),
      extraInstructions:
        typeof parsed.extraInstructions === 'string' ? parsed.extraInstructions : fallback.extraInstructions,
    })
  } catch {
    return fallback
  }
}

type BinaryChoiceFieldProps = {
  label: string
  helperText?: ReactNode
  value: boolean
  trueLabel: string
  falseLabel: string
  onChange: (value: boolean) => void
}

function BinaryChoiceField({
  label,
  helperText,
  value,
  trueLabel,
  falseLabel,
  onChange,
}: BinaryChoiceFieldProps) {
  return (
    <fieldset className="irp-field irp-binary-field">
      <legend className="irp-field-label">{label}</legend>
      <div className="irp-binary-grid" role="group" aria-label={label}>
        <button
          type="button"
          className={`irp-binary-option${!value ? ' is-active' : ''}`}
          aria-pressed={!value}
          onClick={() => onChange(false)}
        >
          {falseLabel}
        </button>
        <button
          type="button"
          className={`irp-binary-option${value ? ' is-active' : ''}`}
          aria-pressed={value}
          onClick={() => onChange(true)}
        >
          {trueLabel}
        </button>
      </div>
      {helperText ? (
        <div className="irp-field-meta">
          <span className="irp-field-helper">{helperText}</span>
        </div>
      ) : null}
    </fieldset>
  )
}

type CheckboxFieldProps = {
  id: string
  label: string
  helperText: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
}

function CheckboxField({ id, label, helperText, checked, onChange }: CheckboxFieldProps) {
  return (
    <label className="irp-checkbox-field" htmlFor={id}>
      <input
        id={id}
        className="irp-checkbox-input"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="irp-checkbox-shell">
        <span className="irp-checkbox-control" aria-hidden="true">
          {checked ? '✓' : ''}
        </span>
        <span className="irp-checkbox-copy">
          <span className="irp-field-label">{label}</span>
          <span className="irp-field-helper">{helperText}</span>
        </span>
      </span>
    </label>
  )
}

type SelectFieldProps<TId extends string> = {
  id: string
  label: string
  value: TId
  helperText?: ReactNode
  disabled?: boolean
  hideSelectionNote?: boolean
  options?: Array<{ id: TId; label: string; description?: ReactNode; disabled?: boolean }>
  optionGroups?: OptionGroup<TId>[]
  onChange: (value: TId) => void
}

function SelectField<TId extends string>({
  id,
  label,
  value,
  helperText,
  disabled = false,
  hideSelectionNote = false,
  options,
  optionGroups,
  onChange,
}: SelectFieldProps<TId>) {
  const flattenedOptions = options ?? optionGroups?.flatMap((group) => group.options) ?? []
  const selectedOption = flattenedOptions.find((option) => option.id === value)
  const showSelectionNote = !hideSelectionNote && selectedOption?.description

  return (
    <label className={`irp-field${disabled ? ' is-disabled' : ''}`} htmlFor={id}>
      <span className="irp-field-label">{label}</span>
      <select
        id={id}
        className="irp-input irp-select"
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as TId)}
      >
        {options?.map((option) => (
          <option key={option.id} value={option.id} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
        {optionGroups?.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((option) => (
              <option key={option.id} value={option.id} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {helperText || showSelectionNote ? (
        <div className="irp-field-meta">
          {helperText ? <span className="irp-field-helper">{helperText}</span> : null}
          {showSelectionNote ? (
            <div className="irp-option-note" aria-live="polite">
              <span className="irp-option-note-label">Current selection</span>
              <span className="irp-option-note-copy">{selectedOption.description}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </label>
  )
}

export default function ImageRecreationPromptsPage() {
  const [formState, setFormState] = useState<ImageRecreationFormState>(() => loadSavedState())
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)

  const sceneOption = SCENE_CATEGORY_MAP[formState.sceneCategory]
  const recommendedPeoplePresence = PEOPLE_PRESENCE_MAP[sceneOption.recommendedPeoplePresence]
  const peopleOverrideWarning =
    formState.peoplePresence !== sceneOption.recommendedPeoplePresence
      ? `This scene usually pairs with ${recommendedPeoplePresence.label.toLowerCase()}. Your override will still be respected, but it departs from the normal scene-fidelity expectation for ${sceneOption.label.toLowerCase()}.`
      : null
  const sourcePhotoIsPeopleFree = !formState.referenceHasPeople
  const forcesPeopleFreeResult = !resultHasVisiblePeople(formState)
  const peopleAmountOptions = (
    formState.referenceHasPeople && !forcesPeopleFreeResult
      ? PEOPLE_PRESENCE_OPTIONS.filter((option) => option.id !== 'no-people')
      : PEOPLE_PRESENCE_OPTIONS
  ) as typeof PEOPLE_PRESENCE_OPTIONS
  const peopleHandlingOptions: SelectOption<PeopleHandlingId>[] = PEOPLE_HANDLING_OPTIONS.map((option) => ({
    ...option,
    disabled:
      formState.peoplePresence === 'no-people'
        ? !PEOPLE_FREE_HANDLING_IDS.has(option.id)
        : false,
  }))
  const primarySubjectOptions: SelectOption<PrimarySubjectEmphasisId>[] = PRIMARY_SUBJECT_OPTIONS.map((option) => ({
    ...option,
    disabled: forcesPeopleFreeResult && option.id === 'person-first',
  }))
  const allowedVariationOptions: SelectOption<AllowedVariationId>[] = ALLOWED_VARIATION_OPTIONS.map((option) => ({
    ...option,
    disabled:
      forcesPeopleFreeResult &&
      (option.id === 'small-wardrobe-changes' || option.id === 'small-positional-shifts'),
  }))

  const promptOutput = buildImageRecreationPrompt(formState)

  useEffect(() => {
    localStorage.setItem(IMAGE_RECREATION_PROMPTS_STORAGE_KEY, JSON.stringify(formState))
  }, [formState])

  useEffect(() => {
    if (!copyFeedback) return undefined

    const timeoutId = window.setTimeout(() => {
      setCopyFeedback(null)
    }, 2200)

    return () => window.clearTimeout(timeoutId)
  }, [copyFeedback])

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
      }
    }
  }, [])

  function updateForm<K extends keyof Omit<ImageRecreationFormState, 'presetId'>>(
    field: K,
    value: ImageRecreationFormState[K],
  ) {
    setFormState((current) =>
      normalizeFormStateForUi({
        ...current,
        presetId: 'custom',
        [field]: value,
      }),
    )
  }

  function clearReferencePreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }

    setReferencePreviewUrl(null)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function attachReferenceImage(file: File) {
    clearReferencePreview()

    const objectUrl = URL.createObjectURL(file)
    previewUrlRef.current = objectUrl
    setReferencePreviewUrl(objectUrl)
    setIsDragging(false)
  }

  function handlePresetChange(nextPresetId: PromptPresetId) {
    if (nextPresetId === 'custom') return
    setFormState(normalizeFormStateForUi(createFormStateFromPreset(nextPresetId)))
    setCopyFeedback(null)
  }

  function handleSceneCategoryChange(nextSceneCategory: ImageRecreationFormState['sceneCategory']) {
    const nextScene = SCENE_CATEGORY_MAP[nextSceneCategory]

    setFormState((current) =>
      normalizeFormStateForUi({
        ...current,
        presetId: 'custom',
        sceneCategory: nextSceneCategory,
        peoplePresence: current.peopleHandling === 'remove-all-people'
          ? 'no-people'
          : current.referenceHasPeople
            ? nextScene.recommendedPeoplePresence === 'no-people'
              ? getScenePeopleFallback(nextSceneCategory)
              : nextScene.recommendedPeoplePresence
            : 'no-people',
      }),
    )
    setCopyFeedback(null)
  }

  function handleReferenceHasPeopleChange(nextReferenceHasPeople: boolean) {
    setFormState((current) =>
      normalizeFormStateForUi({
        ...current,
        presetId: 'custom',
        referenceHasPeople: nextReferenceHasPeople,
        peopleHandling:
          !nextReferenceHasPeople && current.peopleHandling === 'remove-all-people'
            ? 'keep-every-person-as-is'
            : current.peopleHandling,
        peoplePresence: nextReferenceHasPeople
          ? current.peoplePresence === 'no-people'
            ? getScenePeopleFallback(current.sceneCategory)
            : current.peoplePresence
          : 'no-people',
      }),
    )
    setCopyFeedback(null)
  }

  function handlePeopleHandlingChange(nextPeopleHandling: PeopleHandlingId) {
    setFormState((current) =>
      normalizeFormStateForUi({
        ...current,
        presetId: 'custom',
        peopleHandling: nextPeopleHandling,
        peoplePresence: nextPeopleHandling === 'remove-all-people' ? 'no-people' : current.peoplePresence,
      }),
    )
    setCopyFeedback(null)
  }

  function handlePeoplePresenceChange(nextPeoplePresence: ImageRecreationFormState['peoplePresence']) {
    setFormState((current) =>
      normalizeFormStateForUi({
        ...current,
        presetId: 'custom',
        peoplePresence: nextPeoplePresence,
      }),
    )
    setCopyFeedback(null)
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    attachReferenceImage(file)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)

    const file = event.dataTransfer.files[0]
    if (!file || !file.type.startsWith('image/')) return
    attachReferenceImage(file)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
  }

  async function handleCopyPrompt() {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard access is not available in this browser.')
      }

      await navigator.clipboard.writeText(promptOutput.finalPrompt)
      setCopyFeedback('Prompt copied to clipboard.')
    } catch (error) {
      setCopyFeedback(error instanceof Error ? error.message : 'Failed to copy prompt.')
    }
  }

  function handleReset() {
    setFormState(createFormStateFromPreset(DEFAULT_PROMPT_PRESET_ID))
    setCopyFeedback(null)
    clearReferencePreview()
  }

  return (
    <div className="irp-page">
      <header className="irp-hero">
        <div className="irp-hero-nav">
          <div className="irp-hero-note">
            <strong>Rules engine first</strong>
            <span>No backend calls, no AI rewrite, and no hidden scene invention in v1.</span>
          </div>
          <Link className="irp-nav-link" to="/">
            Back Home
          </Link>
        </div>
        <div className="irp-hero-copy">
          <p className="irp-eyebrow">Questurian Studio</p>
          <h1>
            Image recreation <span className="irp-highlight">prompts</span>
          </h1>
          <p className="irp-lede">
            Build camera-real image-recreation prompts that stay anchored to the reference image,
            preserve the original scene correctly, and explicitly block the most common prompt failures.
          </p>
        </div>
      </header>

      <div className="irp-shell">
          <section className="irp-panel">
            <div className="irp-panel-header">
              <div>
                <p className="irp-panel-kicker">Reference + preset</p>
                <h2>Start from a real reference</h2>
              </div>
            </div>

            <SelectField
              id="irp-preset"
              label="Preset"
              value={formState.presetId}
              onChange={(value) => handlePresetChange(value as PromptPresetId)}
              options={[{ id: 'custom', label: 'Custom' }, ...PROMPT_PRESETS]}
              helperText="Pick a starting recipe, then refine the details below."
            />

            <div className="irp-reference-panel">
              <div className="irp-reference-copy">
                <span className="irp-inline-card-label">Reference image preview</span>
              </div>

              <input
                ref={fileInputRef}
                className="irp-file-input"
                type="file"
                accept="image/*"
                aria-label="Upload reference image"
                onChange={handleFileInputChange}
              />

              {referencePreviewUrl ? (
                <div className="irp-reference-selected">
                  <div className="irp-reference-stage">
                    <div className="irp-reference-overlay">
                      <button
                        type="button"
                        className="irp-reference-icon-btn"
                        aria-label="Replace image"
                        title="Replace image"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M4 7h4l1.4-2h5.2L16 7h4v10H4V7zm8 8.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.8"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="irp-reference-icon-btn irp-reference-icon-btn--danger"
                        aria-label="Remove image"
                        title="Remove image"
                        onClick={clearReferencePreview}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M6 7h12m-9 0V5h6v2m-7 3v6m4-6v6m4-9-1 11H9L8 7"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.8"
                          />
                        </svg>
                      </button>
                    </div>
                    <img
                      className="irp-reference-image"
                      src={referencePreviewUrl}
                      alt="Selected reference preview"
                    />
                    <div className="irp-reference-chip">Preview only</div>
                  </div>
                </div>
              ) : (
                <div
                  className={`irp-drop-zone${isDragging ? ' is-dragging' : ''}`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      fileInputRef.current?.click()
                    }
                  }}
                >
                  <div className="irp-drop-zone-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path
                        d="M12 16V5m0 0-4 4m4-4 4 4M5 19h14"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                      />
                    </svg>
                  </div>
                  <div className="irp-drop-zone-copy">
                    <strong>{isDragging ? 'Drop reference image here' : 'Click or drag a reference image here'}</strong>
                    <span>JPG, PNG, or WebP. Preview only. No upload, no analysis.</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="irp-panel">
            <div className="irp-panel-header">
              <div>
                <p className="irp-panel-kicker">Scene fidelity</p>
                <h2>Lock the scene before styling it</h2>
              </div>
            </div>

            <SelectField
              id="irp-scene-category"
              label="Scene category"
              value={formState.sceneCategory}
              options={SCENE_CATEGORY_OPTIONS}
              helperText="Start by locking the kind of scene this actually is: landscape, landmark, city, portrait, architecture, mural, market, cafe, nightlife, and so on."
              onChange={handleSceneCategoryChange}
            />
            <BinaryChoiceField
              label="Any people in the reference photo?"
              value={formState.referenceHasPeople}
              falseLabel="No, none visible"
              trueLabel="Yes, people are visible"
              helperText="Answer this from the source image itself. This keeps the prompt anchored to what is actually in the photo before you decide how people should be handled."
              onChange={handleReferenceHasPeopleChange}
            />
            {sourcePhotoIsPeopleFree ? (
              <div className="irp-callout irp-callout--people-lock" role="status">
                <strong>People controls are locked</strong>
                <p>
                  Because the reference photo is marked as people-free, the people amount,
                  people handling, and crowd vibe controls stay greyed out.
                </p>
              </div>
            ) : null}
            <SelectField
              id="irp-people-presence"
              label="People amount / crowd level"
              value={formState.peoplePresence}
              disabled={sourcePhotoIsPeopleFree || forcesPeopleFreeResult}
              hideSelectionNote={sourcePhotoIsPeopleFree}
              options={peopleAmountOptions}
              helperText={
                sourcePhotoIsPeopleFree
                  ? 'This stays on No people because you marked the source photo as people-free.'
                  : forcesPeopleFreeResult
                    ? 'This field is locked to No people because the selected people-handling mode removes everyone from the photo.'
                    : 'Set how many people or how much crowd activity the image should preserve or work toward after the people-handling rule is applied.'
              }
              onChange={handlePeoplePresenceChange}
            />

            {peopleOverrideWarning ? (
              <div className="irp-callout irp-callout--warning" role="status">
                <strong>Scene/people override</strong>
                <p>{peopleOverrideWarning}</p>
              </div>
            ) : null}

            <SelectField
              id="irp-people-handling"
              label="People handling"
              value={formState.peopleHandling}
              disabled={sourcePhotoIsPeopleFree}
              hideSelectionNote={sourcePhotoIsPeopleFree}
              options={peopleHandlingOptions}
              helperText={
                formState.peoplePresence === 'no-people'
                  ? formState.referenceHasPeople
                    ? 'Because the current result is people-free, the handling rule is reduced to preserve-as-is or remove-everyone logic only.'
                    : 'Because the source photo is marked as people-free, people-dependent handling modes are disabled.'
                  : 'This tells the prompt whether the visible people must stay, can be reduced slightly, can be fully recast, or should stay secondary to the environment.'
              }
              onChange={handlePeopleHandlingChange}
            />
            <SelectField
              id="irp-crowd-character"
              label="People / crowd vibe"
              value={formState.crowdCharacter}
              disabled={sourcePhotoIsPeopleFree || forcesPeopleFreeResult}
              hideSelectionNote={sourcePhotoIsPeopleFree || forcesPeopleFreeResult}
              options={CROWD_CHARACTER_OPTIONS}
              helperText={
                forcesPeopleFreeResult
                  ? 'This field is disabled because the current people settings produce a people-free image, so crowd styling has no effect.'
                  : 'Use broad crowd or travel vibes like international tourists, locals-dominant, family-heavy, or stylish city weekend energy. This tool does not target race or ethnicity directly.'
              }
              onChange={(value) => updateForm('crowdCharacter', value)}
            />
            <SelectField
              id="irp-primary-subject"
              label="Primary subject emphasis"
              value={formState.primarySubjectEmphasis}
              options={primarySubjectOptions}
              helperText={
                forcesPeopleFreeResult
                  ? 'People-first is disabled because the current people settings produce a people-free image.'
                  : 'This decides what should visually lead the frame: the place, the landmark, the people, or a balanced mix.'
              }
              onChange={(value) => updateForm('primarySubjectEmphasis', value)}
            />
            <SelectField
              id="irp-preservation-strength"
              label="Preservation strength"
              value={formState.preservationStrength}
              options={PRESERVATION_STRENGTH_OPTIONS}
              helperText="Use this to control how tightly the final image stays locked to the original scene identity."
              onChange={(value) => updateForm('preservationStrength', value)}
            />
            <SelectField
              id="irp-allowed-variation"
              label="Allowed variation"
              value={formState.allowedVariation}
              options={allowedVariationOptions}
              helperText={
                forcesPeopleFreeResult
                  ? 'Wardrobe and positional-shift variations are disabled because the current result is people-free.'
                  : 'This controls what kinds of secondary changes are allowed once the main scene and people rules are set.'
              }
              onChange={(value) => updateForm('allowedVariation', value)}
            />
          </section>

          <section className="irp-panel">
            <div className="irp-panel-header">
              <div>
                <p className="irp-panel-kicker">Camera realism</p>
                <h2>Shape the photograph, not the scene identity</h2>
              </div>
            </div>

            <SelectField
              id="irp-camera"
              label="Camera preset"
              value={formState.cameraPreset}
              optionGroups={CAMERA_PRESET_GROUPS}
              helperText="Choose from flagship mirrorless bodies, premium travel/reportage cameras, and film-era classics."
              onChange={(value) => updateForm('cameraPreset', value)}
            />
            <SelectField
              id="irp-lens"
              label="Lens preset"
              value={formState.lensPreset}
              optionGroups={LENS_PRESET_GROUPS}
              helperText="Pick the optical feel: flagship primes, workhorse zooms, or older character glass for a more analog result."
              onChange={(value) => updateForm('lensPreset', value)}
            />
            <SelectField
              id="irp-capture-style"
              label="Capture style"
              value={formState.captureStyle}
              options={CAPTURE_STYLE_OPTIONS}
              helperText="Use this to steer the editorial tone, travel feel, documentary energy, or campaign polish of the shot."
              onChange={(value) => updateForm('captureStyle', value)}
            />
            <SelectField
              id="irp-shot-perspective"
              label="Shot perspective"
              value={formState.shotPerspective}
              options={SHOT_PERSPECTIVE_OPTIONS}
              helperText="Match reference viewpoint keeps the safest recreation. Other options deliberately reinterpret camera height or angle while keeping the same scene identity."
              onChange={(value) => updateForm('shotPerspective', value)}
            />
            <CheckboxField
              id="irp-center-main-subject"
              label="Center and balance the composition"
              checked={formState.centerMainSubject}
              helperText="Center the main subject in the composition and create a more symmetrical, balanced image. Align the subject along the vertical center axis, correct any tilt or perspective distortion, and evenly distribute visual weight on both sides of the frame. Straighten lines where needed, improve framing so the scene feels intentional and harmonious, and keep the result realistic and natural to the original image."
              onChange={(value) => updateForm('centerMainSubject', value)}
            />
            <SelectField
              id="irp-filter-look"
              label="Filter / color look"
              value={formState.filterLook}
              optionGroups={FILTER_LOOK_GROUPS}
              helperText="Choose a clean digital look, an editorial film stock, or a more nostalgic vintage treatment."
              onChange={(value) => updateForm('filterLook', value)}
            />
            <div className="irp-callout irp-callout--camera">
              <strong>Vintage-ready combos</strong>
              <p>Quick starting points if you want analog travel/editorial character without guessing through the whole gear stack.</p>
              <div className="irp-combo-grid">
                {VINTAGE_COMBO_NOTES.map((combo) => (
                  <div key={combo.title} className="irp-combo-card">
                    <span className="irp-combo-title">{combo.title}</span>
                    <span className="irp-combo-recipe">{combo.recipe}</span>
                    <span className="irp-combo-note">{combo.note}</span>
                  </div>
                ))}
              </div>
            </div>
            <SelectField
              id="irp-lighting"
              label="Lighting / time of day"
              value={formState.lighting}
              options={LIGHTING_OPTIONS}
              helperText="This controls the light quality, contrast, sky feel, and time-of-day atmosphere in the final image."
              onChange={(value) => updateForm('lighting', value)}
            />
            <SelectField
              id="irp-environment-enhancement"
              label="Environment enhancement"
              value={formState.environmentEnhancement}
              options={ENVIRONMENT_ENHANCEMENT_OPTIONS}
              helperText="Choose how hard the prompt should push realism in terrain, architecture, haze, shadows, and scene depth."
              onChange={(value) => updateForm('environmentEnhancement', value)}
            />
          </section>

          <section className="irp-panel">
            <div className="irp-panel-header">
              <div>
                <p className="irp-panel-kicker">Extra instructions</p>
                <h2>Add final guidance carefully</h2>
              </div>
            </div>

            <label className="irp-field" htmlFor="irp-extra-instructions">
              <span className="irp-field-label">Additional user guidance</span>
              <span className="irp-field-helper">
                Add any last-mile direction that should refine the prompt without overriding the main scene and preservation rules.
              </span>
              <textarea
                id="irp-extra-instructions"
                className="irp-input irp-textarea"
                aria-label="Additional user guidance"
                value={formState.extraInstructions}
                onChange={(event) => updateForm('extraInstructions', event.target.value)}
                placeholder="Example: keep the sky slightly clearer, preserve a believable travel-editorial finish, and keep the landmark dominant."
                rows={5}
              />
            </label>
          </section>

        <section className="irp-panel irp-preview-panel">
          <div className="irp-preview-header">
            <div>
              <p className="irp-panel-kicker">Live prompt preview</p>
              <h2>Generator-ready output</h2>
            </div>
            <div className="irp-action-row">
              <button type="button" className="irp-btn irp-btn-primary" onClick={handleCopyPrompt}>
                Copy prompt
              </button>
              <button type="button" className="irp-btn irp-btn-secondary" onClick={handleReset}>
                Reset
              </button>
            </div>
          </div>

          {copyFeedback ? <p className="irp-copy-feedback">{copyFeedback}</p> : null}

          <textarea
            className="irp-preview-textarea"
            readOnly
            aria-label="Final prompt preview"
            value={promptOutput.finalPrompt}
            rows={16}
          />
        </section>
      </div>
    </div>
  )
}
