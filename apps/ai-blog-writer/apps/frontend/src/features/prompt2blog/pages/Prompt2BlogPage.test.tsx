/* @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as prompt2blogApi from '../api'
import { DEFAULT_COMPOSER_STATE, saveComposerState } from '../composer/composer.storage'
import Prompt2BlogPage from './Prompt2BlogPage'

vi.mock('../api', () => ({
  PROMPT2BLOG_DIRECTION_OPTION_IDS: ['direction-1', 'direction-2', 'direction-3'],
  getPrompt2BlogDebug: vi.fn(),
  getPrompt2BlogEditorialOptions: vi.fn(),
  getPrompt2BlogGuidelinePreview: vi.fn(),
  getPrompt2BlogInputOptions: vi.fn(),
  getPrompt2BlogResult: vi.fn(),
  getPrompt2BlogStatus: vi.fn(),
  startPrompt2BlogRun: vi.fn(),
}))

const getPrompt2BlogDebugMock = vi.mocked(prompt2blogApi.getPrompt2BlogDebug)
const getPrompt2BlogEditorialOptionsMock = vi.mocked(prompt2blogApi.getPrompt2BlogEditorialOptions)
const getPrompt2BlogGuidelinePreviewMock = vi.mocked(prompt2blogApi.getPrompt2BlogGuidelinePreview)
const getPrompt2BlogInputOptionsMock = vi.mocked(prompt2blogApi.getPrompt2BlogInputOptions)
const getPrompt2BlogResultMock = vi.mocked(prompt2blogApi.getPrompt2BlogResult)
const getPrompt2BlogStatusMock = vi.mocked(prompt2blogApi.getPrompt2BlogStatus)
const startPrompt2BlogRunMock = vi.mocked(prompt2blogApi.startPrompt2BlogRun)

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <Prompt2BlogPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

// jsdom defines navigator.clipboard as a read-only accessor, so it has to be
// redefined rather than assigned.
function stubClipboard(writeText: ReturnType<typeof vi.fn>) {
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  return () => {
    if (original) Object.defineProperty(navigator, 'clipboard', original)
    else Reflect.deleteProperty(navigator, 'clipboard')
  }
}

function createStoredPipelineResult() {
  return {
    message: 'Prompt2Blog pipeline v2 queued',
    run_id: 'run-123',
    pipeline_status: 'ready_for_staging',
    article_type: {
      id: 7,
      name: 'Destination Guide',
      definition: 'Comprehensive overview of a place for trip planning.',
    },
    guideline_meta: {
      guideline: 'Lead with practical value.',
      title_guideline: 'Keep titles clear and useful.',
    },
    improved_article: {
      title: 'Sample destination guide',
      content: 'Body content',
    },
    final_markdown: 'Sample destination guide',
    run_cost: {
      stack_id: 'editorial-premium',
      models: {
        worker: 'gemini-3.7-flash',
        writer: 'gemini-3.1-pro-preview',
        judge: 'gemini-3.7-flash',
      },
      input_tokens: 123456,
      output_tokens: 23456,
      cached_input_tokens: 3456,
      total_tokens: 146912,
      successful_calls: 11,
      measured_calls: 11,
      measurement_status: 'complete',
      estimated_cost_usd: 0.184321,
      currency: 'USD',
      by_model: [
        {
          model: 'gemini-3.7-flash',
          input_tokens: 90000,
          output_tokens: 12000,
          cached_input_tokens: 3456,
          total_tokens: 102000,
          calls: 7,
          estimated_cost_usd: 0.108417,
        },
        {
          model: 'gemini-3.1-pro-preview',
          input_tokens: 33456,
          output_tokens: 11456,
          cached_input_tokens: 0,
          total_tokens: 44912,
          calls: 4,
          estimated_cost_usd: 0.075904,
        },
      ],
      pricing_note: 'Standard global Vertex rates checked 2026-08-24.',
    },
    quality_review: {
      alignment_summary: 'Aligned',
      improvements_applied: [],
      remaining_gaps: [],
      quality_summary: 'Strong result',
      quality_scores: {
        overall: 90,
        guideline_coverage: 90,
        informativeness: 90,
        originality: 90,
        brief_adherence: 90,
        seo: 90,
      },
      constraint_checks: {
        target_word_count_met: true,
        paragraph_length_met: true,
        cta_present: true,
        primary_keyword_present: true,
        secondary_keywords_present: true,
        audience_match: true,
        tone_match: true,
      },
      word_count_estimate: 900,
      repair_applied: false,
      editorial_augmentation_applied: false,
      editorial_components_added: [],
      editorial_augmentation_summary: '',
      editorial_diagnostic: {
        cognitive_load: 'strong',
        narrative_density: 'strong',
        emphasis_clarity: 'strong',
        reading_behavior_risk: 'weak',
      },
      coverage: {
        coverage_sufficient: true,
        analysis: 'Sufficient',
        missing_sections: [],
      },
      model_used: 'gemini-2.5-flash-lite',
    },
  }
}

function createDirectionResponseJson() {
  const directions = [
    'Build a food-first weekend around markets, bakeries, and traditional restaurants.',
    'Explain how to connect major sights efficiently with trams, metro, and walking.',
    'Design a low-stress first visit with neighborhood bases and realistic daily pacing.',
  ] as const
  const questions = [
    'Which food experiences deserve limited weekend time?',
    'How should a visitor move between essential Lisbon sights?',
    'Where should a first-time visitor stay and slow down?',
  ] as const
  const outcomes = [
    'Choose a compact set of distinctive meals and markets.',
    'Plan efficient routes without overloading each day.',
    'Select a convenient base and a manageable weekend rhythm.',
  ] as const
  const evidenceQuestions = [
    'Which current venues and markets best represent Lisbon food culture?',
    'What do current transit routes, fares, and walking times support?',
    'Which neighborhoods balance access, atmosphere, and rest?',
  ] as const
  const rationales = [
    'Makes Lisbon food the organizing promise for a short visit.',
    'Solves the practical mobility problem that shapes a first weekend.',
    'Centers comfort and pacing for readers unfamiliar with the city.',
  ] as const
  const makeOption = (optionId: 'direction-1' | 'direction-2' | 'direction-3', index: number) => ({
    option_id: optionId,
    direction: directions[index - 1],
    form_id: 'service-guide',
    topic_module_ids: index === 1 ? ['food-drink'] : ['transportation'],
    audience: {
      primary_reader: index === 1 ? 'First-time weekend visitors' : `Lisbon reader ${index}`,
      tags: ['first-time-visitor'],
    },
    core_reader_question: questions[index - 1],
    reader_outcome: outcomes[index - 1],
    primary_subject: 'Lisbon',
    scope: {
      mode: 'single_subject',
      references: [{ name: 'Lisbon', role: 'primary_subject' }],
    },
    requirements: [
      {
        requirement_id: `r${index}`,
        question: evidenceQuestions[index - 1],
      },
    ],
    exclusions: [`Do not drift into direction ${index + 1}`],
    rationale: rationales[index - 1],
  })

  return JSON.stringify({
    schema_version: 3,
    original_title: 'A weekend in Lisbon',
    location: 'Lisbon, Portugal',
    options: [
      makeOption('direction-1', 1),
      makeOption('direction-2', 2),
      makeOption('direction-3', 3),
    ],
  })
}

describe('Prompt2BlogPage', () => {
  let restoreClipboard: (() => void) | null = null

  afterEach(() => {
    cleanup()
    restoreClipboard?.()
    restoreClipboard = null
  })

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()

    getPrompt2BlogEditorialOptionsMock.mockResolvedValue({
      schema_version: 3,
      forms: [
        {
          id: 'service-guide',
          label: 'Service Guide',
          description: 'Practical guidance for making a trip work.',
          order: 1,
          source_requirements: [],
        },
        {
          id: 'comparison',
          label: 'Comparison',
          description: 'A scoped comparison between named subjects.',
          order: 2,
          source_requirements: [],
        },
      ],
      topic_modules: [
        {
          id: 'food-drink',
          label: 'Food & Drink',
          description: 'Eating well.',
          order: 1,
        },
        {
          id: 'transportation',
          label: 'Transportation',
          description: 'Getting around.',
          order: 2,
        },
      ],
      audience_tags: [
        {
          id: 'first-time-visitor',
          label: 'First-time visitor',
          description: 'New arrivals.',
        },
      ],
      scope_modes: [
        {
          id: 'single_subject',
          label: 'Single subject',
          description: 'One primary subject.',
        },
        {
          id: 'head_to_head',
          label: 'Head to head',
          description: 'Direct comparison.',
        },
      ],
      reference_roles: [
        {
          id: 'primary_subject',
          label: 'Primary subject',
          description: 'The article subject.',
        },
        {
          id: 'context_only',
          label: 'Context only',
          description: 'Context, not a comparison.',
        },
        {
          id: 'comparator',
          label: 'Comparator',
          description: 'Compared directly.',
        },
      ],
    })

    getPrompt2BlogInputOptionsMock.mockResolvedValue({
      article_types: [
        {
          id: 7,
          name: 'Destination Guide',
          definition: 'Comprehensive overview of a place for trip planning.',
        },
        {
          id: 9,
          name: 'Itinerary Article',
          definition: 'Day-by-day or stop-by-stop planning format.',
        },
        {
          id: 11,
          name: 'FAQ Article',
          definition: 'Question-driven education answering common queries.',
        },
      ],
      tones: [{ id: 'balanced', label: 'Balanced' }],
      lengths: [{ id: 'standard', label: 'Standard' }],
      brand_voices: [{ id: 'questurian', label: 'Questurian' }],
      defaults: {
        tone_id: 'balanced',
        length_id: 'standard',
        brand_voice_id: 'questurian',
      },
    })
    getPrompt2BlogGuidelinePreviewMock.mockResolvedValue({
      id: 7,
      name: 'Destination Guide',
      guideline: 'Lead with practical value.',
      title_guideline: 'Keep titles clear and useful.',
      guideline_file: 'Destination Guide.md',
      title_guideline_file: 'Destination Guide.md',
    })
    startPrompt2BlogRunMock.mockResolvedValue({
      message: 'Prompt2Blog full run queued',
      run_id: 'run-123',
    })
    getPrompt2BlogStatusMock.mockResolvedValue({
      run_id: 'run-123',
      feature: 'prompt2blog',
      state: 'running',
      stage: 'queued',
      error: null,
      updated_at: '2026-03-17T09:00:00Z',
    })
    getPrompt2BlogResultMock.mockResolvedValue({
      run_id: 'run-123',
      markdown: '',
      artifact: {},
    })
    getPrompt2BlogDebugMock.mockResolvedValue({
      run_id: 'run-123',
      status: {
        run_id: 'run-123',
        feature: 'prompt2blog',
        state: 'running',
        stage: 'queued',
        error: null,
        updated_at: '2026-03-17T09:00:00Z',
      },
      stages: {},
      output: null,
    })
  })

  it('starts with an Easy Set Up block containing Title and Location fields', async () => {
    renderPage()

    const easySetupPanel = screen.getByRole('heading', { name: 'Easy Set Up' }).closest('section')
    const coreInputsPanel = screen.getByRole('heading', { name: 'Core Inputs' }).closest('section')
    const modelRoutingPanel = screen.getByRole('heading', { name: 'Run Stack' }).closest('section')

    expect(easySetupPanel).toBeInTheDocument()
    expect(modelRoutingPanel?.compareDocumentPosition(easySetupPanel!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(easySetupPanel?.compareDocumentPosition(coreInputsPanel!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(within(easySetupPanel!).getByLabelText('Title')).toBeInTheDocument()
    expect(within(easySetupPanel!).getByLabelText('Location')).toBeInTheDocument()
    expect(within(easySetupPanel!).getByLabelText('Approved JSON')).not.toBeVisible()
    expect(within(easySetupPanel!).queryByLabelText('Direction JSON')).not.toBeInTheDocument()
    expect(
      within(easySetupPanel!).getByRole('button', {
        name: 'Generate direction prompt',
      }),
    ).toBeDisabled()
    expect(within(easySetupPanel!).queryByLabelText('Prompt')).not.toBeInTheDocument()
  })

  it('requires Title and Location before opening an editable prompt block', async () => {
    renderPage()

    // The prompt quotes the loaded option catalogs, so wait for them to arrive.
    await screen.findByRole('option', { name: 'Destination Guide' })
    const confirmSetup = screen.getByRole('button', {
      name: 'Generate direction prompt',
    })

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'A weekend in Lisbon' },
    })
    expect(confirmSetup).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Location'), {
      target: { value: 'Lisbon, Portugal' },
    })
    expect(confirmSetup).toBeEnabled()
    fireEvent.click(confirmSetup)

    const prompt = screen.getByLabelText('Prompt')
    expect((prompt as HTMLTextAreaElement).value).toContain('Original title: "A weekend in Lisbon"')
    expect((prompt as HTMLTextAreaElement).value).toContain('Location: "Lisbon, Portugal"')
    expect((prompt as HTMLTextAreaElement).value).toContain(
      'Return one JSON object and nothing else',
    )
    expect((prompt as HTMLTextAreaElement).value).toContain(
      '- service-guide (Service Guide) — Practical guidance for making a trip work.',
    )
    expect((prompt as HTMLTextAreaElement).value).toContain(
      'Do not browse, research facts, or write the article.',
    )

    fireEvent.change(prompt, {
      target: { value: 'Edited prompt' },
    })
    expect(prompt).toHaveValue('Edited prompt')

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Three days in Porto' },
    })
    expect(screen.queryByLabelText('Prompt')).not.toBeInTheDocument()
  })

  it('copies the generated Easy Set Up prompt to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    restoreClipboard = stubClipboard(writeText)

    renderPage()
    await screen.findByRole('option', { name: 'Destination Guide' })

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'A weekend in Lisbon' },
    })
    fireEvent.change(screen.getByLabelText('Location'), {
      target: { value: 'Lisbon, Portugal' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate direction prompt' }))

    const promptValue = (screen.getByLabelText('Prompt') as HTMLTextAreaElement).value
    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }))

    expect(writeText).toHaveBeenCalledWith(promptValue)
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument()
  })

  it('reports a failed Easy Set Up prompt copy instead of doing nothing', async () => {
    restoreClipboard = stubClipboard(vi.fn().mockRejectedValue(new Error('denied')))

    renderPage()
    await screen.findByRole('option', { name: 'Destination Guide' })

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'A weekend in Lisbon' },
    })
    fireEvent.change(screen.getByLabelText('Location'), {
      target: { value: 'Lisbon, Portugal' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate direction prompt' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }))

    expect(await screen.findByRole('button', { name: 'Copy failed' })).toBeInTheDocument()
  })

  it('fills the whole form from an approved JSON brief once it checks out', async () => {
    renderPage()
    await screen.findByRole('option', { name: 'Destination Guide' })
    fireEvent.click(screen.getByText('Legacy v2 brief import'))

    const approved = JSON.stringify({
      direction: 'A routing piece for a reader who loses their weekend to transit.',
      title: 'A Weekend in Lisbon',
      location: 'Lisbon, Portugal',
      article_type: 'Itinerary Article',
      article_goal: 'Plan two full days without wasted transit.',
      target_reader: 'A first-time visitor with 48 hours.',
      destination_context: 'Lisbon, Portugal, on the Tagus estuary.',
      angle: 'Neighbourhood-first planning beats landmark ticking.',
      call_to_action: 'Book the viewpoint slot before arriving.',
      tone_id: 'balanced',
      length_id: 'standard',
      brand_voice_id: 'questurian',
      creativity_level: 'high',
      primary_keyword: 'weekend in lisbon',
      secondary_keywords: ['lisbon itinerary', '48 hours in lisbon'],
      must_include: ['Tram 28 crowding', 'Airport transfer costs'],
      negative_instructions: ['No unsourced price claims'],
      enable_editorial_augmentation: true,
      source_material: ['RESEARCH NEEDED: current Carris fare'],
      model_name: 'gemini-2.5-pro',
      writing_model: 'gemini-2.5-flash',
    })

    fireEvent.change(screen.getByLabelText('Approved JSON'), {
      target: { value: approved },
    })
    expect(screen.getByRole('button', { name: 'Apply to form' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Check JSON' }))

    expect(
      screen.getByText('Every value matches the loaded options. Review and apply.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Itinerary Article (id 9)')).toBeInTheDocument()
    expect(
      screen.getByText('A routing piece for a reader who loses their weekend to transit.'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Apply to form' }))

    expect(screen.getByLabelText('Article Type')).toHaveValue('9')
    expect(screen.getByLabelText('Article Goal')).toHaveValue(
      'Plan two full days without wasted transit.',
    )
    expect(screen.getByLabelText('Target Reader')).toHaveValue(
      'A first-time visitor with 48 hours.',
    )
    expect(screen.getByLabelText('Editorial Angle (Optional)')).toHaveValue(
      'Neighbourhood-first planning beats landmark ticking.',
    )
    expect(screen.getByLabelText('Call to Action (Optional)')).toHaveValue(
      'Book the viewpoint slot before arriving.',
    )
    expect(screen.getByLabelText('Tone')).toHaveValue('balanced')
    expect(screen.getByLabelText('Creativity Level')).toHaveValue('high')
    expect(screen.getByLabelText('Pipeline preset')).toHaveValue('editorial-premium')
    expect(screen.getByLabelText('Primary Keyword')).toHaveValue('weekend in lisbon')
    expect(screen.getByLabelText('Secondary Keywords (comma-separated)')).toHaveValue(
      'lisbon itinerary, 48 hours in lisbon',
    )
    expect(screen.getByLabelText('Must Include (one per line)')).toHaveValue(
      'Tram 28 crowding\nAirport transfer costs',
    )
    expect(screen.getByLabelText('Negative Instructions (one per line)')).toHaveValue(
      'No unsourced price claims',
    )
    expect(screen.getByLabelText('Add editorial extras')).toBeChecked()
    expect(screen.getByLabelText('Title')).toHaveValue('A Weekend in Lisbon')
    expect(screen.getByText('Applied 18 fields to the form below.')).toBeInTheDocument()
  })

  it('blocks applying a brief whose values are not in the loaded options', async () => {
    renderPage()
    await screen.findByRole('option', { name: 'Destination Guide' })
    fireEvent.click(screen.getByText('Legacy v2 brief import'))

    fireEvent.change(screen.getByLabelText('Approved JSON'), {
      target: { value: '{"article_type": "Destination Guides"}' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Check JSON' }))

    expect(screen.getByText(/nothing was applied/)).toBeInTheDocument()
    expect(screen.getByText(/Closest match: "Destination Guide"/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply to form' })).toBeDisabled()
    expect(screen.getByLabelText('Article Goal')).toHaveValue('')
  })

  it('retracts an approved check as soon as the pasted JSON is edited', async () => {
    renderPage()
    await screen.findByRole('option', { name: 'Destination Guide' })
    fireEvent.click(screen.getByText('Legacy v2 brief import'))

    const box = screen.getByLabelText('Approved JSON')
    fireEvent.change(box, {
      target: { value: '{"article_type": "Destination Guides"}' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Check JSON' }))
    expect(screen.getByText(/nothing was applied/)).toBeInTheDocument()

    fireEvent.change(box, {
      target: { value: '{"article_type": "Destination Guide"}' },
    })

    expect(screen.queryByText(/nothing was applied/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply to form' })).toBeDisabled()
  })

  it('preserves Easy Set Up values in the composer draft', async () => {
    const { unmount } = renderPage()

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'A weekend in Lisbon' },
    })
    fireEvent.change(screen.getByLabelText('Location'), {
      target: { value: 'Lisbon, Portugal' },
    })
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('p2b-form-draft') || '{}')).toEqual(
        expect.objectContaining({
          easySetupLocation: 'Lisbon, Portugal',
          easySetupTitle: 'A weekend in Lisbon',
        }),
      )
    })

    unmount()
    renderPage()

    expect(screen.getByLabelText('Title')).toHaveValue('A weekend in Lisbon')
    expect(screen.getByLabelText('Location')).toHaveValue('Lisbon, Portugal')
  })

  it('offers price-ordered full-run presets and shows their assignments', async () => {
    renderPage()

    const preset = await screen.findByLabelText('Pipeline preset')
    const options = within(preset).getAllByRole('option')
    const receipt = screen.getByLabelText('Editorial Premium model assignments')

    // Grouped rather than one price-ordered list: the two families are not
    // points on one scale, because a Claude-writer stack pays for its writing
    // out of the subscription instead of per token.
    expect(
      within(preset)
        .getAllByRole('group')
        .map(group => group.getAttribute('label')),
    ).toEqual(['Gemini — billed per token', 'Claude writes — included in your plan'])
    expect(options.map(option => option.textContent)).toEqual([
      '$$$$$$ · Maximum Quality · Slowest',
      '$$$$$ · Premium Review · Slow',
      '$$$$ · Editorial Premium · Moderate',
      '$$$ · Fast + Optimal · Fast',
      '$$ · Best Value · Faster',
      '$ · Fastest',
      'Plan + $$$ · Opus · Max · Slowest',
      'Plan + $$ · Opus · Balanced · Slow',
      'Plan + $ · Opus · Lean · Moderate',
      'Plan + $$$ · Sonnet · Max · Slow',
      'Plan + $$ · Sonnet · Balanced · Moderate',
      'Plan + $ · Sonnet · Lean · Fast',
    ])
    expect(preset).toHaveValue('editorial-premium')
    expect(within(receipt).getByText('Research worker')).toBeInTheDocument()
    expect(within(receipt).getByText('Article writer')).toBeInTheDocument()
    expect(within(receipt).getByText('Quality judge')).toBeInTheDocument()
    expect(within(receipt).getByText('Gemini 3.1 Pro Preview')).toBeInTheDocument()
    const pricing = screen.getByLabelText('Editorial Premium estimated pricing')
    expect(within(pricing).getByText('$2.55')).toBeInTheDocument()
    expect(within(pricing).getByText('Input $1.32 / 1M')).toBeInTheDocument()
    expect(within(pricing).getByText('Output $7.50 / 1M')).toBeInTheDocument()
  })

  it('prices a Claude-writer stack as plan usage rather than inventing a rate', async () => {
    renderPage()

    const preset = await screen.findByLabelText('Pipeline preset')
    fireEvent.change(preset, { target: { value: 'opus-balanced' } })

    // Before this, estimatePrompt2BlogStackPrice threw for any model with no
    // Vertex rate, and this selection took the whole panel down with it.
    const pricing = screen.getByLabelText('Opus · Balanced estimated pricing')
    // The rate covers the metered roles only -- research and audit -- rather
    // than being diluted by treating the plan-served writer as free.
    expect(within(pricing).getByText('$1.35')).toBeInTheDocument()
    expect(within(pricing).getByText('Input $0.75 / 1M')).toBeInTheDocument()
    expect(within(pricing).getByText('Metered part')).toBeInTheDocument()
    expect(within(pricing).getByText(/Article writer runs on your Claude plan/)).toBeInTheDocument()

    const receipt = screen.getByLabelText('Opus · Balanced model assignments')
    expect(within(receipt).getByText('Claude Opus 5')).toBeInTheDocument()
    // The grunt work does not move.
    expect(within(receipt).getAllByText('Gemini 3.7 Flash')).toHaveLength(2)
  })

  it('keeps editorial extras off until the operator opts in', async () => {
    renderPage()

    const editorialExtras = await screen.findByLabelText('Add editorial extras')

    expect(editorialExtras).not.toBeChecked()
    expect(
      screen.getByText('May add a useful pull quote, callout, FAQ, or takeaway box.'),
    ).toBeInTheDocument()

    fireEvent.click(editorialExtras)

    expect(editorialExtras).toBeChecked()
  })

  it('folds every middle section behind one Article Details bar', async () => {
    renderPage()

    const advancedGenerationSummary = await screen.findByText('Advanced generation controls')
    const advancedGeneration = advancedGenerationSummary.closest('details')
    const advancedSeoSummary = screen.getByText('Advanced SEO controls')
    const advancedSeo = advancedSeoSummary.closest('details')
    const optionalGuidanceSummary = screen.getByText('Optional editorial guidance')
    const optionalGuidance = optionalGuidanceSummary.closest('details')

    const articleDetailsHeading = screen.getByRole('heading', {
      name: 'Article Details',
    })
    const articleDetails = articleDetailsHeading.closest('details')
    const middlePanels = [
      'Core Inputs',
      'Prompt Profiles',
      'SEO + Constraints',
      'Source Material',
      'Guideline Preview',
    ].map(title => screen.getByRole('heading', { name: title }).closest('details'))

    expect(screen.getByRole('heading', { name: 'Easy Set Up' }).closest('details')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Pipeline' }).closest('details')).toBeNull()
    expect(articleDetails).not.toHaveAttribute('open')
    middlePanels.forEach(panel => expect(panel).toBe(articleDetails))

    expect(advancedGeneration).not.toHaveAttribute('open')
    expect(advancedSeo).not.toHaveAttribute('open')
    expect(optionalGuidance).not.toHaveAttribute('open')
    for (const label of [
      'Creativity Level',
      'Negative Instructions (one per line)',
      'Add editorial extras',
    ]) {
      expect(screen.getByLabelText(label).closest('details')).toBe(advancedGeneration)
    }
    expect(screen.getByLabelText('Pipeline preset').closest('details')).toBeNull()
    expect(screen.queryByLabelText('Audience Profile (Optional)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Prompt Enhance')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Secondary Keywords (comma-separated)').closest('details')).toBe(
      advancedSeo,
    )
    expect(screen.getByLabelText('Editorial Angle (Optional)').closest('details')).toBe(
      optionalGuidance,
    )
    expect(screen.getByLabelText('Call to Action (Optional)').closest('details')).toBe(
      optionalGuidance,
    )

    fireEvent.click(articleDetailsHeading)
    fireEvent.click(advancedGenerationSummary)
    fireEvent.click(advancedSeoSummary)
    fireEvent.click(optionalGuidanceSummary)

    expect(articleDetails).toHaveAttribute('open')
    expect(advancedGeneration).toHaveAttribute('open')
    expect(advancedSeo).toHaveAttribute('open')
    expect(optionalGuidance).toHaveAttribute('open')
  })

  it('opens optional editorial guidance when a saved draft uses it', async () => {
    saveComposerState({
      ...DEFAULT_COMPOSER_STATE,
      angle: 'Peru is the better first stop',
      callToAction: 'Compare fares',
    })

    renderPage()

    const optionalGuidanceSummary = await screen.findByText('Optional editorial guidance')
    const optionalGuidance = optionalGuidanceSummary.closest('details')

    expect(optionalGuidance).toHaveAttribute('open')
    expect(screen.getByLabelText('Editorial Angle (Optional)')).toHaveValue(
      'Peru is the better first stop',
    )
    expect(screen.getByLabelText('Call to Action (Optional)')).toHaveValue('Compare fares')
  })

  it('preserves optional guidance across toggles and clears it with core inputs', async () => {
    renderPage()

    const optionalGuidanceSummary = await screen.findByText('Optional editorial guidance')
    const angle = screen.getByLabelText('Editorial Angle (Optional)')
    const callToAction = screen.getByLabelText('Call to Action (Optional)')

    fireEvent.click(optionalGuidanceSummary)
    fireEvent.change(angle, {
      target: { value: 'Peru is the better first stop' },
    })
    fireEvent.change(callToAction, { target: { value: 'Compare fares' } })
    fireEvent.click(optionalGuidanceSummary)
    fireEvent.click(optionalGuidanceSummary)

    expect(angle).toHaveValue('Peru is the better first stop')
    expect(callToAction).toHaveValue('Compare fares')

    const coreInputsPanel = screen.getByRole('heading', { name: 'Core Inputs' }).closest('section')
    fireEvent.click(within(coreInputsPanel!).getByRole('button', { name: 'Clear section' }))

    expect(angle).toHaveValue('')
    expect(callToAction).toHaveValue('')
  })

  it('preserves advanced values across disclosure toggles and clears them by section', async () => {
    renderPage()

    const advancedGenerationSummary = await screen.findByText('Advanced generation controls')
    const advancedSeoSummary = screen.getByText('Advanced SEO controls')
    const negativeInstructions = screen.getByLabelText('Negative Instructions (one per line)')
    const secondaryKeywords = screen.getByLabelText('Secondary Keywords (comma-separated)')

    fireEvent.click(advancedGenerationSummary)
    fireEvent.change(negativeInstructions, {
      target: { value: 'Avoid generic praise' },
    })
    fireEvent.click(advancedGenerationSummary)
    fireEvent.click(advancedGenerationSummary)

    fireEvent.click(advancedSeoSummary)
    fireEvent.change(secondaryKeywords, {
      target: { value: 'family hotels, free museums' },
    })
    fireEvent.click(advancedSeoSummary)
    fireEvent.click(advancedSeoSummary)

    expect(negativeInstructions).toHaveValue('Avoid generic praise')
    expect(secondaryKeywords).toHaveValue('family hotels, free museums')

    const promptProfilesPanel = screen
      .getByRole('heading', { name: 'Prompt Profiles' })
      .closest('section')
    const seoPanel = screen.getByRole('heading', { name: 'SEO + Constraints' }).closest('section')

    fireEvent.click(
      within(promptProfilesPanel!).getByRole('button', {
        name: 'Clear section',
      }),
    )
    fireEvent.click(within(seoPanel!).getByRole('button', { name: 'Clear section' }))

    expect(negativeInstructions).toHaveValue('')
    expect(secondaryKeywords).toHaveValue('')
  })

  it('sends every model bundled by the selected run stack', async () => {
    renderPage()

    await waitFor(() => {
      expect(getPrompt2BlogInputOptionsMock).toHaveBeenCalled()
    })

    fireEvent.change(screen.getByLabelText('Article Type'), {
      target: { value: '7' },
    })
    fireEvent.change(screen.getByLabelText('Article Goal'), {
      target: { value: 'Help readers pick the right neighborhoods.' },
    })
    fireEvent.change(screen.getByLabelText('Target Reader'), {
      target: { value: 'First-time visitors' },
    })
    fireEvent.change(screen.getByLabelText('Destination Context'), {
      target: { value: 'Lisbon, Portugal' },
    })
    fireEvent.change(screen.getByLabelText('Pipeline preset'), {
      target: { value: 'best-value' },
    })
    fireEvent.change(screen.getByLabelText('Source Block 1'), {
      target: {
        value: 'Alfama is historic. Principe Real is calmer and more upscale.',
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Run Prompt2Blog Pipeline' }))

    await waitFor(() => {
      expect(startPrompt2BlogRunMock).toHaveBeenCalledWith(
        expect.objectContaining({
          article_type_id: 7,
          model_name: 'gemini-3.1-flash-lite',
          writing_model: 'gemini-3.7-flash',
          audit_model: 'gemini-3.7-flash',
          tone_id: 'balanced',
          length_id: 'standard',
          enable_editorial_augmentation: false,
          source_material: ['Alfama is historic. Principe Real is calmer and more upscale.'],
        }),
      )
    })
  })

  it('blocks legacy submission while an editorial v3 direction is active', async () => {
    saveComposerState({
      ...DEFAULT_COMPOSER_STATE,
      activeWorkflow: 'editorial_v3',
      articleTypeId: 7,
      editorial: {
        ...DEFAULT_COMPOSER_STATE.editorial,
        approval: { status: 'awaiting_selection' },
      },
    })

    renderPage()

    const runButton = screen.getByRole('button', {
      name: 'Run Prompt2Blog Pipeline',
    })
    expect(runButton).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Editorial v3 direction work is active. Research import ships next',
    )
    fireEvent.click(runButton)
    expect(startPrompt2BlogRunMock).not.toHaveBeenCalled()
  })

  it('imports three directions, approves an editable commission, and can return to legacy', async () => {
    renderPage()
    await waitFor(() => expect(getPrompt2BlogEditorialOptionsMock).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'A weekend in Lisbon' },
    })
    fireEvent.change(screen.getByLabelText('Location'), {
      target: { value: 'Lisbon, Portugal' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate direction prompt' }))

    expect(screen.getByRole('button', { name: 'Run Prompt2Blog Pipeline' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Direction JSON'), {
      target: { value: createDirectionResponseJson() },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Check directions' }))
    expect(screen.getByRole('button', { name: 'Show direction cards' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Show direction cards' }))

    const directions = screen.getAllByRole('radio')
    expect(directions).toHaveLength(3)
    fireEvent.click(directions[0])

    expect(await screen.findByText('Approved')).toBeInTheDocument()
    expect(screen.getByLabelText('Original title')).toHaveValue('A weekend in Lisbon')
    expect(screen.getByLabelText('Primary reference')).toHaveValue('Lisbon')

    fireEvent.change(screen.getByLabelText('Primary subject'), {
      target: { value: 'Historic Lisbon' },
    })
    expect(screen.getByText('Needs approval')).toBeInTheDocument()
    expect(screen.getByLabelText('Primary reference')).toHaveValue('Historic Lisbon')
    fireEvent.click(screen.getByRole('button', { name: 'Approve commission' }))
    expect(await screen.findByText('Approved')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Three days in Lisbon' },
    })
    expect(
      screen.queryByRole('group', { name: 'Choose one editorial direction' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run Prompt2Blog Pipeline' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Clear direction work' }))
    expect(screen.getByRole('button', { name: 'Run Prompt2Blog Pipeline' })).toBeEnabled()
  })

  it('lets users choose a travel quick pick and shows the selected definition', async () => {
    renderPage()

    const quickPick = await screen.findByRole('button', {
      name: 'Itinerary Article',
    })
    fireEvent.click(quickPick)

    expect(screen.getByLabelText('Article Type')).toHaveValue('9')
    expect(screen.getByText('Day-by-day or stop-by-stop planning format.')).toBeInTheDocument()
  })

  it('opens cleanup details from the pipeline step', async () => {
    localStorage.setItem(
      'p2b-run-state',
      JSON.stringify({
        sourceStep: 'pipeline_complete',
        pipelineRunId: 'run-123',
        pipelineResult: createStoredPipelineResult(),
      }),
    )

    getPrompt2BlogDebugMock.mockResolvedValue({
      run_id: 'run-123',
      status: {
        run_id: 'run-123',
        feature: 'prompt2blog',
        state: 'completed',
        stage: 'complete',
        error: null,
        updated_at: '2026-03-17T09:00:00Z',
      },
      stages: {
        stage_input_cleanup: {
          created_at: '2026-03-17T09:00:00Z',
          data: {
            cleanup_mode: 'ai_always_aggressive_v1',
            model_name: 'gemini-2.5-flash-lite',
            source_material_count: 2,
            cleaned_sources_count: 2,
            cleanup_stats: [
              { input_chars: 120, output_chars: 100, removed_lines: 2 },
              { input_chars: 80, output_chars: 76, removed_lines: 0 },
            ],
            cleaned_sources: ['Cleaned source one.', 'Cleaned source two.'],
            sources: [
              {
                source_index: 1,
                input_chars: 120,
                preclean_chars: 110,
                cleaned_chars: 100,
                fallback_used: false,
                title: 'Is It Safe to Travel to Peru (2026 Update)',
                published_at: 'March 31, 2026',
                cleaned_text: 'Cleaned source one.',
                removed_blocks: [
                  {
                    label: 'Travel insurance CTA',
                    reason: 'Promotional upsell unrelated to the travel guidance.',
                    excerpt: 'LEARN MORE ABOUT OUR TRAVEL INSURANCE PLANS',
                  },
                ],
              },
              {
                source_index: 2,
                input_chars: 80,
                preclean_chars: 76,
                cleaned_chars: 76,
                fallback_used: true,
                title: '',
                published_at: '',
                cleaned_text: 'Cleaned source two.',
                removed_blocks: [],
              },
            ],
          },
        },
      },
      output: null,
    })

    renderPage()

    const receipt = await screen.findByLabelText('Run cost and token usage')
    expect(within(receipt).getByText('Editorial Premium')).toBeInTheDocument()
    expect(within(receipt).getByText('$0.18')).toBeInTheDocument()
    expect(within(receipt).getByText('146,912')).toBeInTheDocument()
    expect(
      within(receipt).getByText('Measured from all 11 successful model calls.'),
    ).toBeInTheDocument()

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View clean source material details',
      }),
    )

    const dialog = await screen.findByRole('dialog', {
      name: 'Clean source material details',
    })
    expect(dialog).toBeInTheDocument()
    expect(getPrompt2BlogDebugMock).toHaveBeenCalledWith('run-123')
    expect(within(dialog).getByText('ai_always_aggressive_v1')).toBeInTheDocument()
    expect(within(dialog).getByText('gemini-2.5-flash-lite')).toBeInTheDocument()
    expect(
      within(dialog).getByText('Is It Safe to Travel to Peru (2026 Update)'),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('Travel insurance CTA')).toBeInTheDocument()
    expect(within(dialog).getByText('Fallback used')).toBeInTheDocument()
    expect(within(dialog).getByText('Cleaned source one.')).toBeInTheDocument()
    expect(within(dialog).getByText('Input: 120')).toBeInTheDocument()
    expect(
      within(dialog).getByText('No removed-block breakdown is available for fallback cleanup.'),
    ).toBeInTheDocument()
  })
})
