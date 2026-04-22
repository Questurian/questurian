import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../providers/useAuth'
import { fetchLocations } from '../../listicleItineraries/api'
import { ITINERARY_DAY_COUNT_OPTIONS } from '../../listicleItineraries/builder/constants/builder-options.constants'
import type { LocationOption } from '../../listicleItineraries/types'
import {
  formatLocationLabel,
  getLocationLevel,
  normalizeLocationKey,
  parseLocationKey,
} from '../../locationScope/scope'
import '../itineraries-pipeline.css'
import '../../listicleItineraries/styles.css'
import '../../prompt2blog/styles.css'
import {
  DEFAULT_PROMPT2BLOG_MODEL,
  PROMPT2BLOG_MODEL_OPTIONS,
  resolvePrompt2BlogModelName,
} from '../../prompt2blog/constants/prompt2blog.constants'
import type { Prompt2BlogModelName } from '../../prompt2blog/types/pipeline.types'
import { generateItineraryTitles } from '../api'
import { buildItinerariesPipelineChatPrompt } from '../buildChatPrompt'
import {
  getItineraryPipelineTypeMarkdown,
  ITINERARY_PIPELINE_TYPE_OPTIONS,
  type ItineraryPipelineTypeId,
} from '../type-content/itineraryTypeSources'

function readableGeoToken(raw: string | null | undefined): string {
  const value = (raw || '').trim()
  if (!value) return ''
  return value
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function effectiveLevel(loc: LocationOption) {
  return loc.level ?? getLocationLevel(loc)
}

function keysMatch(parentKey: string | null | undefined, childParentKey: string | null | undefined): boolean {
  if (!childParentKey || !parentKey) return false
  return normalizeLocationKey(parentKey) === normalizeLocationKey(childParentKey)
}

/** Payload JSON sometimes types `id` as string; select `value` is coerced to number. */
function locationRowIdsEqual(left: unknown, right: unknown): boolean {
  if (left == null || right == null) return false
  return String(left) === String(right)
}

type LocationSelectGroup = {
  key: string
  label: string
  options: { id: number; label: string }[]
}

function buildLocationSelectGroups(locations: LocationOption[]): LocationSelectGroup[] {
  const countries = locations.filter((l) => effectiveLevel(l) === 'country')
  const cities = locations.filter((l) => effectiveLevel(l) === 'city')
  const neighborhoods = locations.filter((l) => effectiveLevel(l) === 'neighborhood')

  const sortedCountries = [...countries].sort((a, b) =>
    formatLocationLabel(a).localeCompare(formatLocationLabel(b), undefined, { sensitivity: 'base' }),
  )

  const groups: LocationSelectGroup[] = []
  const assigned = new Set<number>()

  for (const country of sortedCountries) {
    const options: { id: number; label: string }[] = []

    options.push({ id: country.id, label: formatLocationLabel(country) })
    assigned.add(country.id)

    const citiesHere = cities
      .filter((c) => keysMatch(country.locationKey, c.parentKey))
      .sort((a, b) =>
        readableGeoToken(a.city).localeCompare(readableGeoToken(b.city), undefined, { sensitivity: 'base' }),
      )

    for (const city of citiesHere) {
      assigned.add(city.id)
      const keyParts = parseLocationKey(city.locationKey || '')
      const cityLabel =
        readableGeoToken(city.city) || readableGeoToken(keyParts[keyParts.length - 1] ?? '')
      options.push({ id: city.id, label: cityLabel })

      const hoodsHere = neighborhoods
        .filter((n) => keysMatch(city.locationKey, n.parentKey))
        .sort((a, b) =>
          readableGeoToken(a.neighborhood).localeCompare(readableGeoToken(b.neighborhood), undefined, {
            sensitivity: 'base',
          }),
        )

      for (const hood of hoodsHere) {
        assigned.add(hood.id)
        const hoodParts = parseLocationKey(hood.locationKey || '')
        const hoodLabel =
          readableGeoToken(hood.neighborhood) || readableGeoToken(hoodParts[hoodParts.length - 1] ?? '')
        options.push({ id: hood.id, label: `${cityLabel} › ${hoodLabel}` })
      }
    }

    groups.push({
      key: country.locationKey || `country-${country.id}`,
      label: formatLocationLabel(country),
      options,
    })
  }

  const orphans = locations.filter((l) => !assigned.has(l.id))
  if (orphans.length > 0) {
    const options = [...orphans]
      .sort((a, b) =>
        formatLocationLabel(a).localeCompare(formatLocationLabel(b), undefined, { sensitivity: 'base' }),
      )
      .map((loc) => ({ id: loc.id, label: formatLocationLabel(loc) }))
    groups.push({ key: '__other__', label: 'Other locations', options })
  }

  return groups
}

type ItinerariesPipelineTabId = 'pipeline' | 'main'

export default function ItinerariesPipelinePage() {
  const { token } = useAuth()
  const [activeTab, setActiveTab] = useState<ItinerariesPipelineTabId>('main')
  const [locationId, setLocationId] = useState<number | null>(null)
  const [dayCount, setDayCount] = useState(1)
  const [itineraryType, setItineraryType] = useState<ItineraryPipelineTypeId>(
    ITINERARY_PIPELINE_TYPE_OPTIONS[0].id,
  )
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [locationsLoading, setLocationsLoading] = useState(false)
  const [locationsError, setLocationsError] = useState<string | null>(null)
  const [copyPromptStatus, setCopyPromptStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const [pipelineLoading, setPipelineLoading] = useState(false)
  const [pipelineError, setPipelineError] = useState<string | null>(null)
  const [pipelineResult, setPipelineResult] = useState<string | null>(null)
  const [pipelineModelUsed, setPipelineModelUsed] = useState<string | null>(null)
  const [pipelineModel, setPipelineModel] = useState<Prompt2BlogModelName>(DEFAULT_PROMPT2BLOG_MODEL)

  const locationGroups = useMemo(() => buildLocationSelectGroups(locations), [locations])
  const selectedLocation = useMemo(() => {
    if (locationId == null) return null
    return locations.find((loc) => locationRowIdsEqual(loc.id, locationId)) ?? null
  }, [locations, locationId])
  const typeMarkdown = useMemo(() => getItineraryPipelineTypeMarkdown(itineraryType), [itineraryType])
  const selectedTypeOption = useMemo(
    () => ITINERARY_PIPELINE_TYPE_OPTIONS.find((opt) => opt.id === itineraryType),
    [itineraryType],
  )

  const pipelinePrompt = useMemo(() => {
    if (!selectedTypeOption || !selectedLocation) return ''
    return buildItinerariesPipelineChatPrompt({
      typeLabel: selectedTypeOption.label,
      locationLabel: formatLocationLabel(selectedLocation),
      dayCount,
      guidelineMarkdown: typeMarkdown,
    })
  }, [selectedTypeOption, selectedLocation, dayCount, typeMarkdown])

  useEffect(() => {
    if (!token) return

    let cancelled = false
    setLocationsLoading(true)
    setLocationsError(null)

    fetchLocations(token)
      .then((docs) => {
        if (cancelled) return
        setLocations(docs)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLocationsError(err instanceof Error ? err.message : 'Failed to load locations')
      })
      .finally(() => {
        if (cancelled) return
        setLocationsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    setPipelineResult(null)
    setPipelineError(null)
    setPipelineModelUsed(null)
  }, [itineraryType, locationId, dayCount, pipelineModel])

  const handleCopyChatGptPrompt = async () => {
    if (!pipelinePrompt) return

    try {
      await navigator.clipboard.writeText(pipelinePrompt)
      setCopyPromptStatus('copied')
      window.setTimeout(() => setCopyPromptStatus('idle'), 2000)
    } catch {
      setCopyPromptStatus('error')
      window.setTimeout(() => setCopyPromptStatus('idle'), 2500)
    }
  }

  const handleRunTitlePipeline = async () => {
    if (!pipelinePrompt) return
    setPipelineLoading(true)
    setPipelineError(null)
    setPipelineResult(null)
    setPipelineModelUsed(null)
    try {
      const { text, model_used: modelUsed } = await generateItineraryTitles({
        prompt: pipelinePrompt,
        modelName: pipelineModel,
      })
      setPipelineResult(text)
      setPipelineModelUsed(modelUsed)
    } catch (err: unknown) {
      setPipelineError(err instanceof Error ? err.message : 'Title pipeline failed')
    } finally {
      setPipelineLoading(false)
    }
  }

  return (
    <div className="stl-page ip-pipeline">
      <header className="stl-hero">
        <div>
          <p className="stl-eyebrow">Questurian Studio</p>
          <h1>Itineraries Pipeline</h1>
          <p className="stl-lede">
            Configure itinerary pipeline runs. More steps will land here as this feature grows.
          </p>
        </div>
        <div className="stl-hero-actions">
          <Link className="stl-btn stl-btn-secondary" to="/">
            Back Home
          </Link>
        </div>
      </header>

      <nav className="ip-tabs" aria-label="Itineraries pipeline sections">
        <div className="ip-tab-list" role="tablist">
          <button
            type="button"
            role="tab"
            id="ip-tab-main"
            aria-selected={activeTab === 'main'}
            aria-controls="ip-tab-panel-main"
            className={`ip-tab${activeTab === 'main' ? ' ip-tab--active' : ''}`}
            onClick={() => setActiveTab('main')}
          >
            main
          </button>
          <button
            type="button"
            role="tab"
            id="ip-tab-pipeline"
            aria-selected={activeTab === 'pipeline'}
            aria-controls="ip-tab-panel-pipeline"
            className={`ip-tab${activeTab === 'pipeline' ? ' ip-tab--active' : ''}`}
            onClick={() => setActiveTab('pipeline')}
          >
            Title generator
          </button>
        </div>
      </nav>

      {activeTab === 'pipeline' ? (
        <div
          className="ip-tab-panel"
          role="tabpanel"
          id="ip-tab-panel-pipeline"
          aria-labelledby="ip-tab-pipeline"
        >
      <section className="stl-panel">
        <div className="stl-panel-header">
          <h2>Setup</h2>
          <div className="stl-inline-actions">
            <button
              type="button"
              className="stl-btn"
              disabled={!pipelinePrompt || pipelineLoading || locationsLoading || Boolean(locationsError)}
              title={
                !pipelinePrompt && !locationsLoading && !locationsError
                  ? 'Select a location before running the pipeline'
                  : undefined
              }
              onClick={() => void handleRunTitlePipeline()}
            >
              {pipelineLoading ? 'Running pipeline…' : 'Run title pipeline (Gemini)'}
            </button>
            <button
              type="button"
              className="stl-btn stl-btn-secondary"
              disabled={!pipelinePrompt || locationsLoading || Boolean(locationsError)}
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
              onChange={(event) => setItineraryType(event.target.value as ItineraryPipelineTypeId)}
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
              disabled={!token || locationsLoading || Boolean(locationsError)}
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
            {locationsError ? <p className="stl-error">{locationsError}</p> : null}
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
            <label htmlFor="itineraries-pipeline-model">Gemini model (title pipeline)</label>
            <select
              id="itineraries-pipeline-model"
              className="p2b-select"
              value={pipelineModel}
              disabled={pipelineLoading}
              onChange={(event) => setPipelineModel(resolvePrompt2BlogModelName(event.target.value))}
            >
              {PROMPT2BLOG_MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="p2b-guideline-hint">
              Same presets as Prompt2Blog’s writing model. Only affects <strong>Run title pipeline</strong>, not the
              copied ChatGPT prompt.
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
              <p>Same prompt as above, run through the app backend (Vertex AI / Gemini).</p>
            </div>
            <div className="p2b-panel-body">
              {pipelineError ? <p className="p2b-guideline-error">{pipelineError}</p> : null}
              {pipelineLoading ? <p className="p2b-guideline-hint">Generating titles…</p> : null}
              {!pipelineLoading && !pipelineError && !pipelineResult ? (
                <p className="p2b-guideline-hint">
                  Run <strong>Run title pipeline (Gemini)</strong> in Setup to see numbered title options here.
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
        </div>
      ) : (
        <div
          className="ip-tab-panel ip-tab-panel--empty"
          role="tabpanel"
          id="ip-tab-panel-main"
          aria-labelledby="ip-tab-main"
        />
      )}
    </div>
  )
}
