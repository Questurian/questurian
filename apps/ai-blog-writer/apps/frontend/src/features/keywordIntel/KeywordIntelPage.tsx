import { FormEvent, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  getKeywordIntelJobs,
  getKeywordIntelResult,
  getKeywordIntelStatus,
  runKeywordIntel,
  type KeywordIntelCollectionDebug,
  type KeywordIntelGroup,
  type KeywordIntelJobSummary,
  type KeywordIntelMarketProfile,
  type KeywordIntelPhraseRecord,
  type KeywordIntelStatusResponse,
} from './api'
import './styles.css'

const COUNTRY_OPTIONS = [
  { value: '', label: 'Select country' },
  { value: 'ar', label: 'Argentina' },
  { value: 'au', label: 'Australia' },
  { value: 'at', label: 'Austria' },
  { value: 'be', label: 'Belgium' },
  { value: 'br', label: 'Brazil' },
  { value: 'ca', label: 'Canada' },
  { value: 'cl', label: 'Chile' },
  { value: 'co', label: 'Colombia' },
  { value: 'cr', label: 'Costa Rica' },
  { value: 'cz', label: 'Czech Republic' },
  { value: 'dk', label: 'Denmark' },
  { value: 'eg', label: 'Egypt' },
  { value: 'fi', label: 'Finland' },
  { value: 'fr', label: 'France' },
  { value: 'de', label: 'Germany' },
  { value: 'gr', label: 'Greece' },
  { value: 'hk', label: 'Hong Kong' },
  { value: 'hu', label: 'Hungary' },
  { value: 'in', label: 'India' },
  { value: 'id', label: 'Indonesia' },
  { value: 'ie', label: 'Ireland' },
  { value: 'il', label: 'Israel' },
  { value: 'it', label: 'Italy' },
  { value: 'jp', label: 'Japan' },
  { value: 'my', label: 'Malaysia' },
  { value: 'mx', label: 'Mexico' },
  { value: 'nl', label: 'Netherlands' },
  { value: 'nz', label: 'New Zealand' },
  { value: 'no', label: 'Norway' },
  { value: 'pe', label: 'Peru' },
  { value: 'ph', label: 'Philippines' },
  { value: 'pl', label: 'Poland' },
  { value: 'pt', label: 'Portugal' },
  { value: 'qa', label: 'Qatar' },
  { value: 'sa', label: 'Saudi Arabia' },
  { value: 'sg', label: 'Singapore' },
  { value: 'za', label: 'South Africa' },
  { value: 'kr', label: 'South Korea' },
  { value: 'es', label: 'Spain' },
  { value: 'se', label: 'Sweden' },
  { value: 'ch', label: 'Switzerland' },
  { value: 'tw', label: 'Taiwan' },
  { value: 'th', label: 'Thailand' },
  { value: 'tr', label: 'Turkey' },
  { value: 'ae', label: 'United Arab Emirates' },
  { value: 'gb', label: 'United Kingdom' },
  { value: 'us', label: 'United States' },
  { value: 'uy', label: 'Uruguay' },
  { value: 'vn', label: 'Vietnam' },
] as const

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'nl', label: 'Dutch' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
] as const

const MARKET_PROFILE_OPTIONS = [
  {
    value: 'custom',
    label: 'Custom market',
    description: 'Use raw country and language inputs for an ad hoc market.',
  },
  {
    value: 'tourists_in_peru_en',
    label: 'Tourists in Peru',
    description: 'Peru SERP context in English for travel-planning searches.',
    geo: 'pe',
    language: 'en',
  },
  {
    value: 'locals_peru_es',
    label: 'Locals in Peru',
    description: 'Peru SERP context in Spanish for local-intent searches.',
    geo: 'pe',
    language: 'es',
  },
  {
    value: 'us_planners_en',
    label: 'US planners',
    description: 'United States SERP context in English for remote trip planning.',
    geo: 'us',
    language: 'en',
  },
] as const satisfies ReadonlyArray<{
  value: KeywordIntelMarketProfile
  label: string
  description: string
  geo?: string
  language?: string
}>

function formatTimestamp(value?: string): string {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    queued: 'Queued',
    ingest_request: 'Validate request',
    resolve_market_context: 'Resolve market',
    collect_autocomplete_records: 'Collect autocomplete',
    collect_related_search_records: 'Collect related searches',
    combine_raw_phrase_pool: 'Combine raw pool',
    normalize_exact_text: 'Normalize exact text',
    classify_phrase_intent_ai: 'Classify intent',
    filter_irrelevant_phrases_ai: 'Filter relevance',
    semantic_group_phrases_ai: 'Group semantically',
    label_groups_ai: 'Label groups',
    extract_pattern_summary: 'Extract patterns',
    score_groups: 'Score groups',
    persist_results: 'Persist results',
    finalize_response: 'Finalize response',
    complete: 'Complete',
  }

  return labels[stage] || stage.replaceAll('_', ' ')
}

function getStatusTone(status?: KeywordIntelStatusResponse | null): string {
  if (!status) return 'idle'
  if (status.state === 'completed') return 'complete'
  if (status.state === 'failed') return 'error'
  return 'running'
}

function getCountryLabel(value?: string | null): string {
  if (!value) return 'Unknown'
  return COUNTRY_OPTIONS.find((option) => option.value === value)?.label || value.toUpperCase()
}

function getLanguageLabel(value?: string | null): string {
  if (!value) return 'Unknown'
  return LANGUAGE_OPTIONS.find((option) => option.value === value)?.label || value
}

function getMarketProfileMeta(value: string): {
  label: string
  description: string
  geo?: string
  language?: string
} {
  return (
    MARKET_PROFILE_OPTIONS.find((option) => option.value === value) || {
      label: value || 'Unknown market',
      description: 'Saved run market profile',
    }
  )
}

function renderJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2)
}

export default function KeywordIntelPage() {
  const queryClient = useQueryClient()
  const [seed, setSeed] = useState('')
  const [marketProfile, setMarketProfile] = useState<KeywordIntelMarketProfile>('custom')
  const [geo, setGeo] = useState('')
  const [language, setLanguage] = useState('en')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [searchDomain, setSearchDomain] = useState('')
  const [region, setRegion] = useState('')
  const [city, setCity] = useState('')
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

  const jobsQuery = useQuery({
    queryKey: ['keyword-intel-jobs'],
    queryFn: () => getKeywordIntelJobs(20),
  })

  const runMutation = useMutation({
    mutationFn: runKeywordIntel,
    onSuccess: (payload) => {
      setActiveRunId(payload.run_id)
      setSelectedJobId(payload.run_id)
      queryClient.invalidateQueries({ queryKey: ['keyword-intel-jobs'] })
    },
  })

  const statusQuery = useQuery({
    queryKey: ['keyword-intel-status', activeRunId],
    enabled: Boolean(activeRunId),
    queryFn: () => getKeywordIntelStatus(activeRunId as string),
    refetchInterval: (query) => {
      const current = query.state.data as KeywordIntelStatusResponse | null | undefined
      if (!activeRunId) return false
      if (!current) return 1200
      if (current.state === 'completed' || current.state === 'failed') return false
      return 1200
    },
  })

  const resultQuery = useQuery({
    queryKey: ['keyword-intel-result', activeRunId],
    enabled: Boolean(activeRunId && statusQuery.data?.state === 'completed'),
    queryFn: () => getKeywordIntelResult(activeRunId as string),
  })

  useEffect(() => {
    if (statusQuery.data?.state === 'completed') {
      queryClient.invalidateQueries({ queryKey: ['keyword-intel-jobs'] })
    }
  }, [queryClient, statusQuery.data?.state])

  const activeStatus = statusQuery.data ?? null
  const activeArtifact = resultQuery.data?.artifact ?? null
  const activeTone = getStatusTone(activeStatus)
  const isCustomMarket = marketProfile === 'custom'
  const selectedMarketProfile = getMarketProfileMeta(marketProfile)
  const marketPreviewGeo = isCustomMarket ? geo : selectedMarketProfile.geo
  const marketPreviewLanguage = isCustomMarket ? language : selectedMarketProfile.language
  const isRunDisabled =
    !seed.trim() ||
    (isCustomMarket && !geo.trim()) ||
    (isCustomMarket && !language.trim()) ||
    runMutation.isPending

  function handleRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isRunDisabled) return

    runMutation.reset()
    setActiveRunId(null)
    setSelectedJobId(null)

    runMutation.mutate({
      seed: seed.trim(),
      market_profile: marketProfile,
      geo: isCustomMarket ? geo.trim().toLowerCase() : undefined,
      language: isCustomMarket ? language.trim().toLowerCase() : undefined,
      device,
      search_domain: searchDomain.trim() || undefined,
      region: region.trim() || undefined,
      city: city.trim() || undefined,
    })
  }

  function handleSelectJob(job: KeywordIntelJobSummary) {
    setSelectedJobId(job.run_id)
    setActiveRunId(job.run_id)
    runMutation.reset()
  }

  return (
    <div className="keyword-intel-page">
      <header className="keyword-intel-hero">
        <div className="keyword-intel-hero-copy">
          <p className="keyword-intel-eyebrow">Questurian Studio</p>
          <h1>
            Keyword intel for
            <span className="keyword-intel-highlight"> real search phrasing</span>
          </h1>
          <p className="keyword-intel-lede">
            Resolve a market first, collect provider phrasing second, then keep the raw records, filtered records, and semantic groupings visible all the way through.
          </p>
        </div>

        <div className="keyword-intel-hero-actions">
          <Link className="keyword-intel-nav-link" to="/">
            &larr; Home
          </Link>
          <div className={`keyword-intel-status-card is-${activeTone}`}>
            <span className="keyword-intel-status-label">Pipeline</span>
            <strong>{activeStatus ? getStageLabel(activeStatus.stage) : 'Ready'}</strong>
            <span>
              {activeStatus?.updated_at
                ? `Updated ${formatTimestamp(activeStatus.updated_at)}`
                : 'Awaiting input'}
            </span>
          </div>
        </div>
      </header>

      <div className="keyword-intel-shell">
        <main className="keyword-intel-main">
          <form className="keyword-intel-panel keyword-intel-form" onSubmit={handleRun}>
            <div className="keyword-intel-panel-header">
              <div>
                <p className="keyword-intel-panel-kicker">Search context</p>
                <h2>Run keyword intel</h2>
              </div>
              <button
                className="keyword-intel-run-button"
                type="submit"
                disabled={isRunDisabled}
              >
                {runMutation.isPending ? 'Running…' : 'Run'}
              </button>
            </div>

            <div className="keyword-intel-form-grid">
              <label className="keyword-intel-field">
                <span>Seed phrase</span>
                <input
                  type="text"
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                  placeholder="restaurants near larcomar"
                />
              </label>

              <label className="keyword-intel-field">
                <span>Market profile</span>
                <select
                  value={marketProfile}
                  onChange={(event) =>
                    setMarketProfile(event.target.value as KeywordIntelMarketProfile)
                  }
                >
                  {MARKET_PROFILE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="keyword-intel-market-preview">
                <span>Resolved market preview</span>
                <strong>{selectedMarketProfile.label}</strong>
                <p>{selectedMarketProfile.description}</p>
                <div className="keyword-intel-meta-badges">
                  <span>{marketPreviewGeo ? getCountryLabel(marketPreviewGeo) : 'Country needed'}</span>
                  <span>
                    {marketPreviewLanguage
                      ? getLanguageLabel(marketPreviewLanguage)
                      : 'Language needed'}
                  </span>
                </div>
              </div>

              {isCustomMarket ? (
                <>
                  <label className="keyword-intel-field">
                    <span>Geo / country</span>
                    <select value={geo} onChange={(event) => setGeo(event.target.value)}>
                      {COUNTRY_OPTIONS.map((option) => (
                        <option key={option.value || 'placeholder'} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="keyword-intel-field">
                    <span>Language</span>
                    <select
                      value={language}
                      onChange={(event) => setLanguage(event.target.value)}
                    >
                      {LANGUAGE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label} ({option.value})
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <div className="keyword-intel-market-note">
                  <span>Market profile defaults</span>
                  <p>
                    This profile locks the geo and language. Use <strong>Custom market</strong>{' '}
                    when you need manual country or language inputs.
                  </p>
                </div>
              )}
            </div>

            <details className="keyword-intel-advanced">
              <summary>Advanced options</summary>
              <div className="keyword-intel-form-grid keyword-intel-form-grid--advanced">
                <label className="keyword-intel-field">
                  <span>Device</span>
                  <select
                    value={device}
                    onChange={(event) => setDevice(event.target.value as 'desktop' | 'mobile')}
                  >
                    <option value="desktop">Desktop</option>
                    <option value="mobile">Mobile</option>
                  </select>
                </label>

                <label className="keyword-intel-field">
                  <span>Search domain</span>
                  <input
                    type="text"
                    value={searchDomain}
                    onChange={(event) => setSearchDomain(event.target.value)}
                    placeholder="google.com"
                  />
                </label>

                <label className="keyword-intel-field">
                  <span>Region</span>
                  <input
                    type="text"
                    value={region}
                    onChange={(event) => setRegion(event.target.value)}
                    placeholder="lima province"
                  />
                </label>

                <label className="keyword-intel-field">
                  <span>City</span>
                  <input
                    type="text"
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    placeholder="lima"
                  />
                </label>
              </div>
            </details>

            {runMutation.error ? (
              <p className="keyword-intel-feedback is-error">{runMutation.error.message}</p>
            ) : null}

            {activeStatus?.state === 'failed' ? (
              <p className="keyword-intel-feedback is-error">
                {activeStatus.error || 'Keyword-intel run failed.'}
              </p>
            ) : null}
          </form>

          <section className="keyword-intel-results-grid">
            <section className="keyword-intel-panel">
              <div className="keyword-intel-panel-header">
                <div>
                  <p className="keyword-intel-panel-kicker">Resolved market</p>
                  <h2>Market context</h2>
                </div>
              </div>
              {activeArtifact?.market_context ? (
                <div className="keyword-intel-market-grid">
                  <ContextStat title="Profile" value={activeArtifact.market_context.market_profile} />
                  <ContextStat
                    title="Country"
                    value={`${getCountryLabel(activeArtifact.market_context.geo)} (${activeArtifact.market_context.geo})`}
                  />
                  <ContextStat
                    title="Language"
                    value={`${activeArtifact.market_context.language_name} (${activeArtifact.market_context.language})`}
                  />
                  <ContextStat
                    title="Provider location"
                    value={`${activeArtifact.market_context.location_name} · ${activeArtifact.market_context.location_type}`}
                  />
                  <ContextStat title="Device" value={activeArtifact.market_context.device} />
                  <ContextStat
                    title="Search domain"
                    value={activeArtifact.market_context.search_domain || 'Default Google domain'}
                  />
                </div>
              ) : (
                <div className="keyword-intel-empty">
                  Resolved market context will appear here after the run completes.
                </div>
              )}
            </section>

            <section className="keyword-intel-panel">
              <div className="keyword-intel-panel-header">
                <div>
                  <p className="keyword-intel-panel-kicker">Collected output</p>
                  <h2>Raw phrases</h2>
                </div>
                <span className="keyword-intel-count">
                  {activeArtifact?.raw_phrases.length ?? 0}
                </span>
              </div>
              <PhraseList
                phrases={activeArtifact?.raw_phrases ?? []}
                emptyLabel="Run a job to see raw provider phrases."
              />
            </section>

            <section className="keyword-intel-panel">
              <div className="keyword-intel-panel-header">
                <div>
                  <p className="keyword-intel-panel-kicker">Retained output</p>
                  <h2>Clean phrases</h2>
                </div>
                <span className="keyword-intel-count">
                  {activeArtifact?.clean_phrases.length ?? 0}
                </span>
              </div>
              <PhraseList
                phrases={activeArtifact?.clean_phrases ?? []}
                emptyLabel="Retained normalized phrases will appear here after filtering."
              />
            </section>

            <section className="keyword-intel-panel">
              <div className="keyword-intel-panel-header">
                <div>
                  <p className="keyword-intel-panel-kicker">Filtered output</p>
                  <h2>Filtered out</h2>
                </div>
                <span className="keyword-intel-count">
                  {activeArtifact?.filtered_out_phrases.length ?? 0}
                </span>
              </div>
              <PhraseList
                phrases={activeArtifact?.filtered_out_phrases ?? []}
                emptyLabel="Irrelevant or noisy phrases will appear here when the filter removes them."
              />
            </section>

            <section className="keyword-intel-panel keyword-intel-panel--wide">
              <div className="keyword-intel-panel-header">
                <div>
                  <p className="keyword-intel-panel-kicker">Semantic output</p>
                  <h2>Grouped opportunities</h2>
                </div>
                <div className="keyword-intel-meta-badges">
                  <span>{activeArtifact?.market_context?.market_profile ?? '--'}</span>
                  <span>{activeArtifact?.geo ?? '--'}</span>
                  <span>{activeArtifact?.language ?? '--'}</span>
                </div>
              </div>

              {activeArtifact?.groups?.length ? (
                <div className="keyword-intel-groups">
                  {activeArtifact.groups.map((group) => (
                    <GroupCard key={group.group_id} group={group} />
                  ))}
                </div>
              ) : (
                <div className="keyword-intel-empty">
                  Grouped keyword clusters will appear here after the run completes.
                </div>
              )}
            </section>

            <section className="keyword-intel-panel">
              <div className="keyword-intel-panel-header">
                <div>
                  <p className="keyword-intel-panel-kicker">Pattern summary</p>
                  <h2>Signals</h2>
                </div>
              </div>

              <SignalRow
                title="Top modifiers"
                values={activeArtifact?.pattern_summary.top_modifiers ?? []}
              />
              <SignalRow
                title="Top entities"
                values={activeArtifact?.pattern_summary.top_entities ?? []}
              />
              <SignalRow
                title="Location anchors"
                values={activeArtifact?.pattern_summary.recurring_location_anchors ?? []}
              />
              <SignalRow
                title="Question stems"
                values={activeArtifact?.pattern_summary.recurring_question_stems ?? []}
              />
              <SignalRow
                title="Feature terms"
                values={activeArtifact?.pattern_summary.recurring_feature_terms ?? []}
              />
              <SignalRow
                title="Platform modifiers"
                values={activeArtifact?.pattern_summary.platform_modifiers ?? []}
              />
            </section>

            <section className="keyword-intel-panel keyword-intel-panel--wide">
              <div className="keyword-intel-panel-header">
                <div>
                  <p className="keyword-intel-panel-kicker">Traceability</p>
                  <h2>Debug details</h2>
                </div>
              </div>

              <details className="keyword-intel-debug">
                <summary>Show phrase records and provider diagnostics</summary>
                {activeArtifact ? (
                  <div className="keyword-intel-debug-grid">
                    <RecordSection
                      title="Raw phrase records"
                      records={activeArtifact.raw_phrase_records}
                    />
                    <RecordSection
                      title="Normalized phrase records"
                      records={activeArtifact.normalized_phrase_records}
                    />
                    <RecordSection
                      title="Retained phrase records"
                      records={activeArtifact.retained_phrase_records}
                    />
                    <RecordSection
                      title="Filtered-out phrase records"
                      records={activeArtifact.filtered_out_phrase_records}
                    />
                    <DebugPayloadCard
                      title="Autocomplete diagnostics"
                      payload={activeArtifact.debug_artifacts.collect_autocomplete_records}
                    />
                    <DebugPayloadCard
                      title="Related-search diagnostics"
                      payload={activeArtifact.debug_artifacts.collect_related_search_records}
                    />
                    <DebugPayloadCard
                      title="Intent classification"
                      payload={activeArtifact.debug_artifacts.classify_phrase_intent_ai}
                    />
                  </div>
                ) : (
                  <div className="keyword-intel-empty">
                    Debug artifacts will appear here after a run completes.
                  </div>
                )}
              </details>
            </section>
          </section>
        </main>

        <aside className="keyword-intel-sidebar">
          <section className="keyword-intel-panel keyword-intel-panel--sidebar">
            <div className="keyword-intel-panel-header">
              <div>
                <p className="keyword-intel-panel-kicker">History</p>
                <h2>Recent jobs</h2>
              </div>
            </div>

            {jobsQuery.isLoading ? (
              <div className="keyword-intel-empty">Loading recent jobs…</div>
            ) : null}

            {jobsQuery.isError ? (
              <div className="keyword-intel-empty">
                {jobsQuery.error instanceof Error
                  ? jobsQuery.error.message
                  : 'Failed to load recent jobs.'}
              </div>
            ) : null}

            {jobsQuery.data?.length ? (
              <div className="keyword-intel-job-list">
                {jobsQuery.data.map((job) => {
                  const isActive = selectedJobId === job.run_id
                  const marketProfileMeta = getMarketProfileMeta(job.market_profile)
                  return (
                    <button
                      className={`keyword-intel-job ${isActive ? 'is-active' : ''}`}
                      key={job.run_id}
                      type="button"
                      onClick={() => handleSelectJob(job)}
                    >
                      <div className="keyword-intel-job-topline">
                        <strong>{job.seed || 'Untitled run'}</strong>
                        <span>{job.state}</span>
                      </div>
                      <div className="keyword-intel-inline-badges">
                        <span>{marketProfileMeta.label}</span>
                        <span>{getCountryLabel(job.geo)}</span>
                        <span>{getLanguageLabel(job.language)}</span>
                      </div>
                      <p>{getStageLabel(job.stage)}</p>
                      <div className="keyword-intel-job-metrics">
                        <span>Raw {job.raw_phrase_count}</span>
                        <span>Clean {job.clean_phrase_count}</span>
                        <span>Filtered {job.filtered_out_phrase_count}</span>
                        <span>Groups {job.group_count}</span>
                      </div>
                      <time>{formatTimestamp(job.updated_at)}</time>
                    </button>
                  )
                })}
              </div>
            ) : null}

            {!jobsQuery.isLoading && !jobsQuery.isError && !jobsQuery.data?.length ? (
              <div className="keyword-intel-empty">No recent keyword-intel jobs yet.</div>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  )
}

function PhraseList({ phrases, emptyLabel }: { phrases: string[]; emptyLabel: string }) {
  if (!phrases.length) {
    return <div className="keyword-intel-empty">{emptyLabel}</div>
  }

  return (
    <ul className="keyword-intel-phrase-list">
      {phrases.map((phrase, index) => (
        <li key={`${phrase}-${index}`}>{phrase}</li>
      ))}
    </ul>
  )
}

function SignalRow({ title, values }: { title: string; values: string[] }) {
  return (
    <section className="keyword-intel-signal-row">
      <h3>{title}</h3>
      {values.length ? (
        <div className="keyword-intel-signal-chips">
          {values.map((value) => (
            <span key={value}>{value}</span>
          ))}
        </div>
      ) : (
        <div className="keyword-intel-empty">No signals yet.</div>
      )}
    </section>
  )
}

function ContextStat({ title, value }: { title: string; value: string }) {
  return (
    <article className="keyword-intel-context-stat">
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  )
}

function GroupCard({ group }: { group: KeywordIntelGroup }) {
  return (
    <article className="keyword-intel-group-card">
      <div className="keyword-intel-group-header">
        <div>
          <p className="keyword-intel-group-label">{group.label}</p>
          <p className="keyword-intel-group-score">Score {group.score.toFixed(2)}</p>
        </div>
        <div className="keyword-intel-inline-badges">
          <span>{group.phrase_ids.length} phrases</span>
          {group.modifier_tags?.map((tag) => <span key={`${group.group_id}-${tag}`}>{tag}</span>)}
          <span>{group.group_id}</span>
        </div>
      </div>
      <ul>
        {group.phrases.map((phrase, index) => (
          <li key={`${group.group_id}-${index}`}>{phrase}</li>
        ))}
      </ul>
    </article>
  )
}

function RecordSection({
  title,
  records,
}: {
  title: string
  records: KeywordIntelPhraseRecord[]
}) {
  return (
    <section className="keyword-intel-debug-card">
      <div className="keyword-intel-panel-header">
        <div>
          <p className="keyword-intel-panel-kicker">Phrase records</p>
          <h2>{title}</h2>
        </div>
        <span className="keyword-intel-count">{records.length}</span>
      </div>

      {records.length ? (
        <div className="keyword-intel-record-list">
          {records.map((record) => (
            <article className="keyword-intel-record-card" key={record.phrase_id}>
              <div className="keyword-intel-record-topline">
                <strong>{record.phrase_id}</strong>
                <span>{record.source_type}</span>
              </div>
              <p>{record.text}</p>
              <p className="keyword-intel-record-normalized">
                normalized: {record.normalized_text}
              </p>
              <div className="keyword-intel-inline-badges">
                <span>rank {record.source_rank ?? 'n/a'}</span>
                <span>{record.geo}</span>
                <span>{record.language}</span>
                {record.platform_modifiers?.map((modifier) => (
                  <span key={`${record.phrase_id}-${modifier}`}>{modifier}</span>
                ))}
                {record.filter_reason ? <span>{record.filter_reason}</span> : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="keyword-intel-empty">No records in this set.</div>
      )}
    </section>
  )
}

function DebugPayloadCard({
  title,
  payload,
}: {
  title: string
  payload?: KeywordIntelCollectionDebug | Record<string, unknown>
}) {
  const requestContext =
    payload && 'provider_request_context' in payload
      ? (payload.provider_request_context as
          | KeywordIntelCollectionDebug['provider_request_context']
          | undefined)
      : undefined
  const count =
    payload && 'count' in payload && typeof payload.count === 'number' ? payload.count : 0

  return (
    <section className="keyword-intel-debug-card">
      <div className="keyword-intel-panel-header">
        <div>
          <p className="keyword-intel-panel-kicker">Provider diagnostics</p>
          <h2>{title}</h2>
        </div>
      </div>

      {payload ? (
        <>
          <div className="keyword-intel-inline-badges">
            <span>{requestContext?.method || 'POST'}</span>
            <span>{requestContext?.path || 'n/a'}</span>
            <span>{count} records</span>
          </div>
          <pre className="keyword-intel-debug-pre">{renderJson(payload)}</pre>
        </>
      ) : (
        <div className="keyword-intel-empty">No provider diagnostics yet.</div>
      )}
    </section>
  )
}
