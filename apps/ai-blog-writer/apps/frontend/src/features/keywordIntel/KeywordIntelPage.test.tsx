import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import KeywordIntelPage from './KeywordIntelPage'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <KeywordIntelPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const RESULT_ARTIFACT = {
  seed: 'restaurants near larcomar',
  geo: 'pe',
  language: 'en',
  raw_phrases: [
    ' Best Restaurants Near Larcomar ',
    'cheap restaurants near larcomar',
    'restaurants near the sound',
  ],
  clean_phrases: [
    'Best Restaurants Near Larcomar',
    'cheap restaurants near larcomar',
  ],
  filtered_out_phrases: ['restaurants near the sound'],
  pattern_summary: {
    top_modifiers: ['best', 'cheap'],
    top_entities: ['restaurants', 'larcomar'],
    recurring_location_anchors: ['larcomar'],
    recurring_question_stems: ['where to eat'],
    recurring_feature_terms: ['seafood'],
  },
  groups: [
    {
      group_id: 'group_best',
      label: 'best overall restaurants',
      phrase_ids: ['phrase_best', 'phrase_where'],
      phrases: [' Best Restaurants Near Larcomar ', 'where to eat near larcomar'],
      score: 0.95,
    },
    {
      group_id: 'group_budget',
      label: 'budget restaurants',
      phrase_ids: ['phrase_budget'],
      phrases: ['cheap restaurants near larcomar'],
      score: 0.72,
    },
  ],
  market_context: {
    market_profile: 'tourists_in_peru_en',
    provider: 'dataforseo',
    geo: 'pe',
    language: 'en',
    device: 'desktop',
    search_domain: 'google.com',
    region: null,
    city: 'lima',
    location_code: 1001,
    location_name: 'Lima, Peru',
    location_type: 'City',
    language_code: 'en',
    language_name: 'English',
  },
  raw_phrase_records: [
    {
      phrase_id: 'phrase_best',
      text: ' Best Restaurants Near Larcomar ',
      normalized_text: 'Best Restaurants Near Larcomar',
      source_type: 'autocomplete',
      provider: 'dataforseo',
      source_rank: 1,
      seed: 'restaurants near larcomar',
      market_profile: 'tourists_in_peru_en',
      geo: 'pe',
      language: 'en',
      device: 'desktop',
      search_domain: 'google.com',
      region: null,
      city: 'lima',
      filter_reason: null,
      is_near_seed: true,
      source_types: ['autocomplete'],
      source_phrase_ids: ['phrase_best'],
      source_ranks: [1],
    },
  ],
  normalized_phrase_records: [
    {
      phrase_id: 'phrase_best',
      text: ' Best Restaurants Near Larcomar ',
      normalized_text: 'Best Restaurants Near Larcomar',
      source_type: 'autocomplete',
      provider: 'dataforseo',
      source_rank: 1,
      seed: 'restaurants near larcomar',
      market_profile: 'tourists_in_peru_en',
      geo: 'pe',
      language: 'en',
      device: 'desktop',
      search_domain: 'google.com',
      region: null,
      city: 'lima',
      filter_reason: null,
      is_near_seed: true,
      source_types: ['autocomplete'],
      source_phrase_ids: ['phrase_best'],
      source_ranks: [1],
    },
  ],
  retained_phrase_records: [
    {
      phrase_id: 'phrase_best',
      text: ' Best Restaurants Near Larcomar ',
      normalized_text: 'Best Restaurants Near Larcomar',
      source_type: 'autocomplete',
      provider: 'dataforseo',
      source_rank: 1,
      seed: 'restaurants near larcomar',
      market_profile: 'tourists_in_peru_en',
      geo: 'pe',
      language: 'en',
      device: 'desktop',
      search_domain: 'google.com',
      region: null,
      city: 'lima',
      filter_reason: null,
      is_near_seed: true,
      source_types: ['autocomplete'],
      source_phrase_ids: ['phrase_best'],
      source_ranks: [1],
    },
  ],
  filtered_out_phrase_records: [
    {
      phrase_id: 'phrase_sound',
      text: 'restaurants near the sound',
      normalized_text: 'restaurants near the sound',
      source_type: 'related_searches',
      provider: 'dataforseo',
      source_rank: 3,
      seed: 'restaurants near larcomar',
      market_profile: 'tourists_in_peru_en',
      geo: 'pe',
      language: 'en',
      device: 'desktop',
      search_domain: 'google.com',
      region: null,
      city: 'lima',
      filter_reason: 'off_topic_market_mismatch',
      is_near_seed: true,
      source_types: ['related_searches'],
      source_phrase_ids: ['phrase_sound'],
      source_ranks: [3],
    },
  ],
  debug_artifacts: {
    collect_autocomplete_records: {
      count: 2,
      provider_request_context: {
        method: 'POST',
        path: '/v3/serp/google/autocomplete/live/advanced',
        payload: [{ keyword: 'restaurants near larcomar' }],
        market_context: {
          market_profile: 'tourists_in_peru_en',
          provider: 'dataforseo',
          geo: 'pe',
          language: 'en',
          device: 'desktop',
          search_domain: 'google.com',
          region: null,
          city: 'lima',
          location_code: 1001,
          location_name: 'Lima, Peru',
          location_type: 'City',
          language_code: 'en',
          language_name: 'English',
        },
      },
      raw_provider_response: {
        task_id: 'task-1',
        results: [{ items_count: 2, items: [{ suggestion: 'best restaurants near larcomar' }] }],
      },
      phrase_records: [],
    },
    collect_related_search_records: {
      count: 2,
      provider_request_context: {
        method: 'POST',
        path: '/v3/serp/google/organic/live/advanced',
        payload: [{ keyword: 'restaurants near larcomar' }],
        market_context: {
          market_profile: 'tourists_in_peru_en',
          provider: 'dataforseo',
          geo: 'pe',
          language: 'en',
          device: 'desktop',
          search_domain: 'google.com',
          region: null,
          city: 'lima',
          location_code: 1001,
          location_name: 'Lima, Peru',
          location_type: 'City',
          language_code: 'en',
          language_name: 'English',
        },
      },
      raw_provider_response: {
        task_id: 'task-2',
        results: [{ items_count: 2, items: [{ title: 'where to eat near larcomar' }] }],
      },
      phrase_records: [],
    },
    normalize_exact_text: {
      normalized_phrase_records: [],
      dropped_records: [],
      count: 2,
    },
    filter_irrelevant_phrases_ai: {
      retained_phrase_records: [],
      filtered_out_phrase_records: [],
      retained_count: 2,
      filtered_count: 1,
    },
  },
}

describe('KeywordIntelPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('blocks submission until required fields are filled for a custom market', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse([]))))

    renderPage()

    const runButton = await screen.findByRole('button', { name: 'Run' })
    expect(runButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Seed phrase'), {
      target: { value: 'restaurants near larcomar' },
    })
    fireEvent.change(screen.getByLabelText('Geo / country'), {
      target: { value: 'pe' },
    })

    expect(runButton).toBeEnabled()
  })

  it('switches to a named market profile and submits without raw geo/language overrides', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/keyword-intel/jobs')) {
        return Promise.resolve(jsonResponse([]))
      }

      if (url.endsWith('/keyword-intel/run') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ message: 'queued', run_id: 'run-1' }))
      }

      return Promise.resolve(jsonResponse({ detail: 'not found' }, 404))
    })

    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    fireEvent.change(await screen.findByLabelText('Market profile'), {
      target: { value: 'tourists_in_peru_en' },
    })
    fireEvent.change(screen.getByLabelText('Seed phrase'), {
      target: { value: 'restaurants near larcomar' },
    })

    expect(screen.queryByLabelText('Geo / country')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Language')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/keyword-intel/run'),
        expect.objectContaining({ method: 'POST' }),
      )
    })

    const runCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith('/keyword-intel/run') && (init as RequestInit)?.method === 'POST',
    )
    const body = JSON.parse(String((runCall?.[1] as RequestInit)?.body))

    expect(body).toMatchObject({
      seed: 'restaurants near larcomar',
      market_profile: 'tourists_in_peru_en',
      device: 'desktop',
    })
    expect(body.geo).toBeUndefined()
    expect(body.language).toBeUndefined()
  })

  it('runs the pipeline, polls status, and renders market-aware results plus debug details', async () => {
    let statusCalls = 0

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)

        if (url.includes('/keyword-intel/jobs')) {
          return Promise.resolve(jsonResponse([]))
        }

        if (url.endsWith('/keyword-intel/run') && init?.method === 'POST') {
          return Promise.resolve(jsonResponse({ message: 'queued', run_id: 'run-1' }))
        }

        if (url.endsWith('/keyword-intel/status/run-1')) {
          statusCalls += 1
          if (statusCalls === 1) {
            return Promise.resolve(
              jsonResponse({
                run_id: 'run-1',
                feature: 'keyword_intel',
                state: 'running',
                stage: 'filter_irrelevant_phrases_ai',
              }),
            )
          }

          return Promise.resolve(
            jsonResponse({
              run_id: 'run-1',
              feature: 'keyword_intel',
              state: 'completed',
              stage: 'complete',
            }),
          )
        }

        if (url.endsWith('/keyword-intel/result/run-1')) {
          return Promise.resolve(
            jsonResponse({
              run_id: 'run-1',
              artifact: RESULT_ARTIFACT,
            }),
          )
        }

        return Promise.resolve(jsonResponse({ detail: 'not found' }, 404))
      }),
    )

    renderPage()

    fireEvent.change(await screen.findByLabelText('Market profile'), {
      target: { value: 'tourists_in_peru_en' },
    })
    fireEvent.change(screen.getByLabelText('Seed phrase'), {
      target: { value: 'restaurants near larcomar' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    await screen.findByText('Filter relevance')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300)
    })

    await screen.findByText('best overall restaurants')
    expect(screen.getByText('Score 0.95')).toBeInTheDocument()
    expect(screen.getByText('tourists_in_peru_en')).toBeInTheDocument()
    expect(screen.getByText('Lima, Peru · City')).toBeInTheDocument()
    expect(screen.getByText('restaurants near the sound')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Show phrase records and provider diagnostics'))

    await screen.findByText('phrase_best')
    expect(screen.getByText('group_best')).toBeInTheDocument()
    expect(screen.getByText('off_topic_market_mismatch')).toBeInTheDocument()
    expect(
      screen.getByText('/v3/serp/google/autocomplete/live/advanced'),
    ).toBeInTheDocument()
  })

  it('loads recent jobs and can reopen a saved result with market context', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)

        if (url.includes('/keyword-intel/jobs')) {
          return Promise.resolve(
            jsonResponse([
              {
                run_id: 'historic-run',
                seed: 'restaurants near larcomar',
                market_profile: 'tourists_in_peru_en',
                geo: 'pe',
                language: 'en',
                state: 'completed',
                stage: 'complete',
                updated_at: '2026-03-15T10:00:00Z',
                raw_phrase_count: 4,
                clean_phrase_count: 3,
                filtered_out_phrase_count: 1,
                group_count: 2,
              },
            ]),
          )
        }

        if (url.endsWith('/keyword-intel/status/historic-run')) {
          return Promise.resolve(
            jsonResponse({
              run_id: 'historic-run',
              feature: 'keyword_intel',
              state: 'completed',
              stage: 'complete',
            }),
          )
        }

        if (url.endsWith('/keyword-intel/result/historic-run')) {
          return Promise.resolve(
            jsonResponse({
              run_id: 'historic-run',
              artifact: RESULT_ARTIFACT,
            }),
          )
        }

        return Promise.resolve(jsonResponse({ detail: 'not found' }, 404))
      }),
    )

    renderPage()

    await screen.findByText('Tourists in Peru')
    expect(screen.getByText('Filtered 1')).toBeInTheDocument()

    const historyButton = await screen.findByRole('button', {
      name: /restaurants near larcomar/i,
    })
    fireEvent.click(historyButton)

    await waitFor(() => {
      expect(screen.getByText('best overall restaurants')).toBeInTheDocument()
    })
    expect(screen.getByText('Lima, Peru · City')).toBeInTheDocument()
  })
})
