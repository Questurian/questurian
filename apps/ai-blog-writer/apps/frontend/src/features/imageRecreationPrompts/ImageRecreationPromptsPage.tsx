import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ALLOWED_VARIATION_OPTIONS,
  ASPECT_RATIO_OPTIONS,
  CAMERA_PRESET_GROUPS,
  CAPTURE_STYLE_OPTIONS,
  DEFAULT_IMAGE_RECREATION_FORM_STATE,
  DEFAULT_PROMPT_PRESET_ID,
  ENVIRONMENT_ENHANCEMENT_OPTIONS,
  FILTER_LOOK_OPTIONS,
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
  VALID_ASPECT_RATIO_IDS,
  VALID_CAMERA_PRESET_IDS,
  VALID_CAPTURE_STYLE_IDS,
  VALID_ENVIRONMENT_ENHANCEMENT_IDS,
  VALID_FILTER_LOOK_IDS,
  VALID_LENS_PRESET_IDS,
  VALID_LIGHTING_IDS,
  VALID_PEOPLE_HANDLING_IDS,
  VALID_PEOPLE_PRESENCE_IDS,
  VALID_PRESERVATION_STRENGTH_IDS,
  VALID_PRIMARY_SUBJECT_IDS,
  VALID_SCENE_CATEGORY_IDS,
  createFormStateFromPreset,
} from './config'
import { buildImageRecreationPrompt } from './promptBuilder'
import type {
  ImageRecreationFormState,
  OptionGroup,
  PromptPresetId,
} from './types'
import './styles.css'

function coerceOptionValue<TId extends string>(
  value: unknown,
  validValues: Set<TId>,
  fallback: TId,
): TId {
  return typeof value === 'string' && validValues.has(value as TId) ? (value as TId) : fallback
}

function loadSavedState(): ImageRecreationFormState {
  const fallback = DEFAULT_IMAGE_RECREATION_FORM_STATE

  try {
    const raw = localStorage.getItem(IMAGE_RECREATION_PROMPTS_STORAGE_KEY)
    if (!raw) return fallback

    const parsed = JSON.parse(raw) as Partial<ImageRecreationFormState>

    return {
      presetId: isKnownPresetId(parsed.presetId) ? parsed.presetId : fallback.presetId,
      sceneCategory: coerceOptionValue(
        parsed.sceneCategory,
        VALID_SCENE_CATEGORY_IDS,
        fallback.sceneCategory,
      ),
      peoplePresence: coerceOptionValue(
        parsed.peoplePresence,
        VALID_PEOPLE_PRESENCE_IDS,
        fallback.peoplePresence,
      ),
      peopleHandling: coerceOptionValue(
        parsed.peopleHandling,
        VALID_PEOPLE_HANDLING_IDS,
        fallback.peopleHandling,
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
      aspectRatio: coerceOptionValue(
        parsed.aspectRatio,
        VALID_ASPECT_RATIO_IDS,
        fallback.aspectRatio,
      ),
      filterLook: coerceOptionValue(
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
    }
  } catch {
    return fallback
  }
}

type SelectFieldProps<TId extends string> = {
  id: string
  label: string
  value: TId
  helperText?: ReactNode
  options?: Array<{ id: TId; label: string }>
  optionGroups?: OptionGroup<TId>[]
  onChange: (value: TId) => void
}

function SelectField<TId extends string>({
  id,
  label,
  value,
  helperText,
  options,
  optionGroups,
  onChange,
}: SelectFieldProps<TId>) {
  return (
    <label className="irp-field" htmlFor={id}>
      <span className="irp-field-label">{label}</span>
      <select
        id={id}
        className="irp-input irp-select"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as TId)}
      >
        {options?.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
        {optionGroups?.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {helperText ? <span className="irp-field-helper">{helperText}</span> : null}
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
  const selectedPreset =
    formState.presetId === 'custom' ? null : PROMPT_PRESETS.find((preset) => preset.id === formState.presetId)
  const peopleOverrideWarning =
    formState.peoplePresence !== sceneOption.recommendedPeoplePresence
      ? `This scene usually pairs with ${recommendedPeoplePresence.label.toLowerCase()}. Your override will still be respected, but it departs from the normal scene-fidelity expectation for ${sceneOption.label.toLowerCase()}.`
      : null

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
    setFormState((current) => ({
      ...current,
      presetId: 'custom',
      [field]: value,
    }))
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
    setFormState(createFormStateFromPreset(nextPresetId))
    setCopyFeedback(null)
  }

  function handleSceneCategoryChange(nextSceneCategory: ImageRecreationFormState['sceneCategory']) {
    const nextScene = SCENE_CATEGORY_MAP[nextSceneCategory]

    setFormState((current) => ({
      ...current,
      presetId: 'custom',
      sceneCategory: nextSceneCategory,
      peoplePresence: nextScene.recommendedPeoplePresence,
    }))
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
              helperText={
                selectedPreset
                  ? selectedPreset.description
                  : undefined
              }
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
              onChange={handleSceneCategoryChange}
            />
            <SelectField
              id="irp-people-presence"
              label="People presence"
              value={formState.peoplePresence}
              options={PEOPLE_PRESENCE_OPTIONS}
              onChange={(value) => updateForm('peoplePresence', value)}
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
              options={PEOPLE_HANDLING_OPTIONS}
              onChange={(value) => updateForm('peopleHandling', value)}
            />
            <SelectField
              id="irp-primary-subject"
              label="Primary subject emphasis"
              value={formState.primarySubjectEmphasis}
              options={PRIMARY_SUBJECT_OPTIONS}
              onChange={(value) => updateForm('primarySubjectEmphasis', value)}
            />
            <SelectField
              id="irp-preservation-strength"
              label="Preservation strength"
              value={formState.preservationStrength}
              options={PRESERVATION_STRENGTH_OPTIONS}
              onChange={(value) => updateForm('preservationStrength', value)}
            />
            <SelectField
              id="irp-allowed-variation"
              label="Allowed variation"
              value={formState.allowedVariation}
              options={ALLOWED_VARIATION_OPTIONS}
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
              onChange={(value) => updateForm('cameraPreset', value)}
            />
            <SelectField
              id="irp-lens"
              label="Lens preset"
              value={formState.lensPreset}
              optionGroups={LENS_PRESET_GROUPS}
              onChange={(value) => updateForm('lensPreset', value)}
            />
            <SelectField
              id="irp-capture-style"
              label="Capture style"
              value={formState.captureStyle}
              options={CAPTURE_STYLE_OPTIONS}
              onChange={(value) => updateForm('captureStyle', value)}
            />
            <SelectField
              id="irp-filter-look"
              label="Filter / color look"
              value={formState.filterLook}
              options={FILTER_LOOK_OPTIONS}
              helperText="Popular, recognizable looks that still stay grounded in travel/editorial realism."
              onChange={(value) => updateForm('filterLook', value)}
            />
            <SelectField
              id="irp-aspect-ratio"
              label="Aspect ratio"
              value={formState.aspectRatio}
              options={ASPECT_RATIO_OPTIONS}
              helperText="Match reference image is the safest option. Other ratios request controlled reframing without changing the scene or inventing missing off-frame content."
              onChange={(value) => updateForm('aspectRatio', value)}
            />
            <SelectField
              id="irp-lighting"
              label="Lighting / time of day"
              value={formState.lighting}
              options={LIGHTING_OPTIONS}
              onChange={(value) => updateForm('lighting', value)}
            />
            <SelectField
              id="irp-environment-enhancement"
              label="Environment enhancement"
              value={formState.environmentEnhancement}
              options={ENVIRONMENT_ENHANCEMENT_OPTIONS}
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
