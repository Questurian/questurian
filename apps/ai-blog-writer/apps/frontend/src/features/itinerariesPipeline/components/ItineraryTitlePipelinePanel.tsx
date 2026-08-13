import { ITINERARY_DAY_COUNT_OPTIONS } from '../../listicleItineraries/builder/constants/builder-options.constants'
import { ITINERARY_TITLE_MODEL_OPTIONS } from '../constants/titleModel.constants'
import {
  ITINERARY_PIPELINE_TYPE_OPTIONS,
  type ItineraryPipelineTypeId
} from '../type-content/itineraryTypeSources'
import type { ItineraryTitlePipelineState } from '../hooks/useItineraryTitlePipeline'

type Props = {
  pipeline: ItineraryTitlePipelineState
}

export function ItineraryTitlePipelinePanel({ pipeline }: Props) {
  const {
    locationId,
    setLocationId,
    dayCount,
    setDayCount,
    itineraryType,
    setItineraryType,
    locationsLoading,
    locationsError,
    locationGroups,
    selectedTypeOption,
    typeMarkdown,
    copyPromptStatus,
    pipelinePrompt,
    pipelineLoading,
    pipelineError,
    pipelineResult,
    pipelineModelUsed,
    pipelineModel,
    setPipelineModel,
    handleCopyChatGptPrompt,
    handleRunTitlePipeline
  } = pipeline

  return (
    <>
      <section className="stl-panel">
        <div className="stl-panel-header">
          <h2>Setup</h2>
          <div className="stl-inline-actions">
            <button
              type="button"
              className="stl-btn"
              disabled={
                !pipelinePrompt ||
                pipelineLoading ||
                locationsLoading ||
                Boolean(locationsError)
              }
              title={
                !pipelinePrompt && !locationsLoading && !locationsError
                  ? 'Select a location before running the pipeline'
                  : undefined
              }
              onClick={() => void handleRunTitlePipeline()}
            >
              {pipelineLoading
                ? 'Running pipeline…'
                : 'Run title pipeline (Claude)'}
            </button>
            <button
              type="button"
              className="stl-btn stl-btn-secondary"
              disabled={
                !pipelinePrompt || locationsLoading || Boolean(locationsError)
              }
              title={
                !pipelinePrompt && !locationsLoading && !locationsError
                  ? 'Select a location before copying the prompt'
                  : undefined
              }
              onClick={() => void handleCopyChatGptPrompt()}
            >
              {copyPromptStatus === 'copied'
                ? 'Copied prompt'
                : copyPromptStatus === 'error'
                  ? 'Copy failed — try again'
                  : 'Copy title prompt for ChatGPT'}
            </button>
          </div>
        </div>
        <div className="stl-grid stl-grid-3">
          <div className="stl-field">
            <label htmlFor="itineraries-pipeline-type">
              <span>Type *</span>
            </label>
            <select
              id="itineraries-pipeline-type"
              name="itineraryType"
              value={itineraryType}
              onChange={(event) =>
                setItineraryType(event.target.value as ItineraryPipelineTypeId)
              }
            >
              {ITINERARY_PIPELINE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="stl-field">
            <label htmlFor="itineraries-pipeline-location">
              <span>Location *</span>
            </label>
            <select
              id="itineraries-pipeline-location"
              name="location"
              value={locationId ?? ''}
              disabled={locationsLoading || Boolean(locationsError)}
              onChange={(event) => {
                const raw = event.target.value
                setLocationId(raw ? Number(raw) : null)
              }}
            >
              <option value="">
                {locationsLoading ? 'Loading locations…' : 'Select location'}
              </option>
              {locationGroups.map((group) => (
                <optgroup key={group.key} label={group.label}>
                  {group.options.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {locationsError ? (
              <p className="stl-error">{locationsError}</p>
            ) : null}
          </div>

          <div className="stl-field">
            <label htmlFor="itineraries-pipeline-day-count">
              <span>Itinerary length (days) *</span>
            </label>
            <select
              id="itineraries-pipeline-day-count"
              name="dayCount"
              value={dayCount}
              onChange={(event) => setDayCount(Number(event.target.value))}
            >
              {ITINERARY_DAY_COUNT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'day' : 'days'}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="ip-pipeline-model">
          <div className="p2b-field ip-pipeline-model-field">
            <label htmlFor="itineraries-pipeline-model">
              Model (title pipeline)
            </label>
            <select
              id="itineraries-pipeline-model"
              className="p2b-select"
              value={pipelineModel}
              disabled={pipelineLoading}
              onChange={(event) => setPipelineModel(event.target.value)}
            >
              {ITINERARY_TITLE_MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="p2b-guideline-hint">
              Titles run on Claude (Anthropic). Only affects{' '}
              <strong>Run title pipeline</strong>, not the copied ChatGPT
              prompt.
            </p>
          </div>
        </div>
      </section>

      <div className="p2b-form-container">
        <div className="p2b-form">
          <section className="p2b-panel">
            <div className="p2b-panel-header">
              <h2>Guideline Preview</h2>
              <p>Loaded from selected itinerary type guideline markdown.</p>
            </div>
            <div className="p2b-panel-body">
              {selectedTypeOption ? (
                <>
                  <p>
                    <strong>{selectedTypeOption.label}</strong>
                    {` (${selectedTypeOption.filename})`}
                  </p>
                  <div className="p2b-raw-json">
                    <pre>{typeMarkdown}</pre>
                  </div>
                </>
              ) : null}
            </div>
          </section>

          <section className="p2b-panel">
            <div className="p2b-panel-header">
              <h2>Title pipeline results</h2>
              <p>
                Same prompt as above, run through the app backend (Vertex AI /
                Gemini).
              </p>
            </div>
            <div className="p2b-panel-body">
              {pipelineError ? (
                <p className="p2b-guideline-error">{pipelineError}</p>
              ) : null}
              {pipelineLoading ? (
                <p className="p2b-guideline-hint">Generating titles…</p>
              ) : null}
              {!pipelineLoading && !pipelineError && !pipelineResult ? (
                <p className="p2b-guideline-hint">
                  Run <strong>Run title pipeline (Gemini)</strong> in Setup to
                  see numbered title options here.
                </p>
              ) : null}
              {pipelineModelUsed ? (
                <p className="p2b-guideline-hint">
                  Model: <strong>{pipelineModelUsed}</strong>
                </p>
              ) : null}
              {pipelineResult ? (
                <div className="p2b-raw-json">
                  <pre>{pipelineResult}</pre>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
