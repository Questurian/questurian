import type { StagedArticle } from '../../types'
import type { Location } from '../../api'
import { EDITOR_MODEL_OPTIONS, resolveEditorModelName } from '../../features/editorial-stage-article/constants'
import { getLocationDisplayName } from '../../features/editorial-stage-article/utils/editorial-stage-view.utils'
import {
  buildPrimaryLocationUpdate,
  sanitizeSharedNeighborhoods,
} from '../../features/editorial-stage-article/utils/sharedNeighborhoods'

type StandardArticleSetupPanelProps = {
  stagedArticle: StagedArticle
  locations: Location[]
  sharedNeighborhoodOptions: Location[]
  selectedSharedNeighborhoods: number[]
  isCityPrimaryLocation: boolean
  isSynced: boolean
  isStep1Locked: boolean
  isGeneratingSlug: boolean
  onUpdateTitle: (title: string) => void
  onUpdateArticle: (updates: Partial<StagedArticle>) => void
  onContinue: () => void
  onGenerateSlug: () => Promise<void>
}

export function StandardArticleSetupPanel({
  stagedArticle,
  locations,
  sharedNeighborhoodOptions,
  selectedSharedNeighborhoods,
  isCityPrimaryLocation,
  isSynced,
  isStep1Locked,
  isGeneratingSlug,
  onUpdateTitle,
  onUpdateArticle,
  onContinue,
  onGenerateSlug,
}: StandardArticleSetupPanelProps) {
  return (
    <section className="stl-panel sab-stage-panel">
      <div className="stl-panel-header">
        <h2>{!isSynced ? <span className="stl-kicker">Step 1</span> : null} Setup</h2>
        {!isSynced ? (
          <div className="stl-inline-actions">
            {isStep1Locked ? (
              stagedArticle.in_update_mode ? (
                <>
                  <button
                    type="button"
                    className="stl-btn stl-btn-secondary"
                    onClick={() => onUpdateArticle({ in_update_mode: false })}
                  >
                    Cancel
                  </button>
                  <button type="button" className="stl-btn" onClick={onContinue}>
                    Save Setup
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="stl-btn stl-btn-secondary"
                  onClick={() => onUpdateArticle({ in_update_mode: true })}
                >
                  Update Setup
                </button>
              )
            ) : (
              <button type="button" className="stl-btn" onClick={onContinue}>
                Continue to Step 2
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div className="sab-stage-field-grid">
        <label className="stl-field">
          <span>Article Title</span>
          <input
            value={stagedArticle.title}
            onChange={(event) => onUpdateTitle(event.target.value)}
            placeholder="Title the article draft"
          />
        </label>

        <label className="stl-field">
          <span>Location</span>
          <select
            value={stagedArticle.locationId || ''}
            onChange={(event) => {
              const nextLocationId = Number(event.target.value) || undefined
              onUpdateArticle(buildPrimaryLocationUpdate({
                locations,
                nextLocationId,
                sharedNeighborhoods: stagedArticle.sharedNeighborhoods,
              }))
            }}
          >
            <option value="">Select location</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {getLocationDisplayName(location)}
              </option>
            ))}
          </select>
        </label>

        {isCityPrimaryLocation ? (
          <label className="stl-field">
            <span>Shared Neighborhoods</span>
            <small>Optional. Exact neighborhood scoping only.</small>
            <select
              multiple
              value={selectedSharedNeighborhoods.map(String)}
              onChange={(event) => {
                const nextSharedNeighborhoods = Array.from(
                  event.currentTarget.selectedOptions,
                  (option) => Number(option.value),
                ).filter((value) => Number.isFinite(value) && value > 0)

                onUpdateArticle({
                  sharedNeighborhoods: sanitizeSharedNeighborhoods(
                    nextSharedNeighborhoods,
                    locations,
                    stagedArticle.locationId,
                  ),
                })
              }}
              style={{ minHeight: '8rem' }}
              disabled={sharedNeighborhoodOptions.length === 0}
            >
              {sharedNeighborhoodOptions.map((location) => (
                <option key={location.id} value={location.id}>
                  {getLocationDisplayName(location)}
                </option>
              ))}
            </select>
            {sharedNeighborhoodOptions.length === 0 ? (
              <small>No neighborhoods are available for this city yet.</small>
            ) : null}
          </label>
        ) : null}

        <label className="stl-field">
          <span>AI Model</span>
          <select
            value={resolveEditorModelName(stagedArticle.editorModelName)}
            onChange={(event) => onUpdateArticle({
              editorModelName: resolveEditorModelName(event.target.value),
            })}
          >
            {EDITOR_MODEL_OPTIONS.map((modelOption) => (
              <option key={modelOption.value} value={modelOption.value}>
                {modelOption.label}
              </option>
            ))}
          </select>
        </label>

        <label className="stl-field">
          <span>Slug *</span>
          <small>URL-friendly identifier (e.g. medellin-digital-nomad-guide-2026)</small>
          <div className="stl-seo-input-wrap">
            <input
              className="stl-seo-input-with-ai"
              value={stagedArticle.payloadSlug || ''}
              onChange={(event) => onUpdateArticle({ payloadSlug: event.target.value })}
              placeholder="e.g. best-steakhouses-las-vegas"
              disabled={!isSynced && isStep1Locked}
            />
            {(isSynced || !isStep1Locked) ? (
              <span className="stl-seo-ai-trigger-wrap">
                <button
                  type="button"
                  className="stl-btn stl-btn-secondary stl-seo-ai-btn"
                  onClick={() => void onGenerateSlug()}
                  disabled={isGeneratingSlug || !stagedArticle.title.trim()}
                >
                  {isGeneratingSlug ? 'Generating...' : 'AI'}
                </button>
              </span>
            ) : null}
          </div>
        </label>
      </div>

      {isStep1Locked && !isSynced ? (
        <p className="sab-stage-summary">
          Locked with title, primary location, optional shared neighborhoods, and AI model. Updating setup will unlock later steps.
        </p>
      ) : null}
    </section>
  )
}
