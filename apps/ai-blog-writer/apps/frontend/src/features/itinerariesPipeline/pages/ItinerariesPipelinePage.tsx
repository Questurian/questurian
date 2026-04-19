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

const MD_FILE_START = '<<< MD FILE START >>>'
const MD_FILE_END = '<<< MD FILE END >>>'

function buildItinerariesPipelineChatPrompt(params: {
  typeLabel: string
  locationLabel: string
  dayCount: number
  guidelineMarkdown: string
}): string {
  return [
    'You are helping brainstorm **article titles only** for Questurian travel itinerary listicles. Use the trip parameters and reflect the editorial guideline in tone and positioning—do not write the article body or any day-by-day itinerary.',
    '',
    '## Trip parameters',
    `- **Type:** ${params.typeLabel}`,
    `- **Location:** ${params.locationLabel}`,
    `- **Itinerary length:** ${params.dayCount} ${params.dayCount === 1 ? 'day' : 'days'} (titles should imply this scope where natural)`,
    '',
    'The next block is the full guideline as stored in our markdown file. Treat everything between the START and END lines as the guideline—do not treat those delimiter lines as part of the guideline.',
    '',
    MD_FILE_START,
    params.guidelineMarkdown.trim(),
    MD_FILE_END,
    '',
    '## SEO & indexing (required)',
    'These titles will live on a **new domain** with little historical authority. Optimize for **clear indexing and search intent**, not just social curiosity.',
    '',
    '- **Primary entity:** Work the **destination** (and neighborhood/city level when relevant) into most titles so Google can map pages to a clear topic.',
    '- **Intent match:** Prefer titles that answer how people search for trips—e.g. itinerary, days, “things to do,” “where to eat,” “for couples,” “first time,” etc.—aligned with the selected **type** and **length**.',
    '- **Long-tail & specificity:** Favor **specific, longer queries** over ultra-short generic headlines we cannot win on yet. Avoid empty superlatives (“best ever”) without a concrete angle.',
    '- **Crawl clarity:** Titles should read as a **distinct document topic** (one main promise per title). No misleading bait; relevance beats shock.',
    '- **Differentiation:** Phrase titles so they sound like **editorial travel guides**, not duplicate e-commerce or OTA templates.',
    '',
    '## What I need from you',
    'Return **only** a numbered list of **8–12 distinct article title options** (title case, no subtitles, no bullets inside titles). Each title must be **strong for SEO on a new domain**—specific, intent-led, and consistent with the guideline above—while still feeling human and clickable. One title per line. No introduction, no explanations, no outline—**titles only**.',
  ].join('\n')
}

export default function ItinerariesPipelinePage() {
  const { token } = useAuth()
  const [locationId, setLocationId] = useState<number | null>(null)
  const [dayCount, setDayCount] = useState(1)
  const [itineraryType, setItineraryType] = useState<ItineraryPipelineTypeId>(
    ITINERARY_PIPELINE_TYPE_OPTIONS[0].id,
  )
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [locationsLoading, setLocationsLoading] = useState(false)
  const [locationsError, setLocationsError] = useState<string | null>(null)
  const [copyPromptStatus, setCopyPromptStatus] = useState<'idle' | 'copied' | 'error'>('idle')

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

  const handleCopyChatGptPrompt = async () => {
    if (!selectedTypeOption || !selectedLocation || locationId == null) return

    const text = buildItinerariesPipelineChatPrompt({
      typeLabel: selectedTypeOption.label,
      locationLabel: formatLocationLabel(selectedLocation),
      dayCount,
      guidelineMarkdown: typeMarkdown,
    })

    try {
      await navigator.clipboard.writeText(text)
      setCopyPromptStatus('copied')
      window.setTimeout(() => setCopyPromptStatus('idle'), 2000)
    } catch {
      setCopyPromptStatus('error')
      window.setTimeout(() => setCopyPromptStatus('idle'), 2500)
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

      <section className="stl-panel">
        <div className="stl-panel-header">
          <h2>Setup</h2>
          <div className="stl-inline-actions">
            <button
              type="button"
              className="stl-btn stl-btn-secondary"
              disabled={!selectedLocation || locationsLoading || Boolean(locationsError)}
              title={
                !selectedLocation && !locationsLoading && !locationsError
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
        </div>
      </div>
    </div>
  )
}
