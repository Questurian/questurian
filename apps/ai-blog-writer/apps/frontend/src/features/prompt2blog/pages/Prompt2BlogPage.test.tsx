/* @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as prompt2blogApi from '../api'
import {
  DEFAULT_COMPOSER_STATE,
  saveComposerState,
} from '../composer/composer.storage'
import { DEFAULT_PROMPT2BLOG_MODEL } from '../constants/prompt2blog.constants'
import Prompt2BlogPage from './Prompt2BlogPage'

vi.mock('../api', () => ({
  getPrompt2BlogDebug: vi.fn(),
  getPrompt2BlogGuidelinePreview: vi.fn(),
  getPrompt2BlogInputOptions: vi.fn(),
  getPrompt2BlogResult: vi.fn(),
  getPrompt2BlogStatus: vi.fn(),
  startPrompt2BlogRun: vi.fn(),
}))

const getPrompt2BlogDebugMock = vi.mocked(prompt2blogApi.getPrompt2BlogDebug)
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

describe('Prompt2BlogPage', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    localStorage.clear()

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

  it('defaults the base draft model selector to flash lite', async () => {
    renderPage()

    const modelSelect = await screen.findByLabelText('Base Draft Model')

    expect(modelSelect).toHaveValue(DEFAULT_PROMPT2BLOG_MODEL)
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

  it('keeps optional controls collapsed while core choices stay visible', async () => {
    renderPage()

    const advancedGenerationSummary = await screen.findByText('Advanced generation controls')
    const advancedGeneration = advancedGenerationSummary.closest('details')
    const advancedSeoSummary = screen.getByText('Advanced SEO controls')
    const advancedSeo = advancedSeoSummary.closest('details')
    const optionalGuidanceSummary = screen.getByText('Optional editorial guidance')
    const optionalGuidance = optionalGuidanceSummary.closest('details')

    expect(advancedGeneration).not.toHaveAttribute('open')
    expect(advancedSeo).not.toHaveAttribute('open')
    expect(optionalGuidance).not.toHaveAttribute('open')
    for (const label of [
      'Tone',
      'Length',
      'Brand Voice',
      'Primary Keyword',
      'Must Include (one per line)',
    ]) {
      expect(screen.getByLabelText(label).closest('details')).toBeNull()
    }
    for (const label of [
      'Base Draft Model',
      'Writer Model',
      'Creativity Level',
      'Negative Instructions (one per line)',
      'Add editorial extras',
    ]) {
      expect(screen.getByLabelText(label).closest('details')).toBe(advancedGeneration)
    }
    expect(screen.queryByLabelText('Audience Profile (Optional)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Prompt Enhance')).not.toBeInTheDocument()
    expect(
      screen.getByLabelText('Secondary Keywords (comma-separated)').closest('details'),
    ).toBe(advancedSeo)
    expect(screen.getByLabelText('Editorial Angle (Optional)').closest('details')).toBe(
      optionalGuidance,
    )
    expect(screen.getByLabelText('Call to Action (Optional)').closest('details')).toBe(
      optionalGuidance,
    )

    fireEvent.click(advancedGenerationSummary)
    fireEvent.click(advancedSeoSummary)
    fireEvent.click(optionalGuidanceSummary)

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
    fireEvent.change(angle, { target: { value: 'Peru is the better first stop' } })
    fireEvent.change(callToAction, { target: { value: 'Compare fares' } })
    fireEvent.click(optionalGuidanceSummary)
    fireEvent.click(optionalGuidanceSummary)

    expect(angle).toHaveValue('Peru is the better first stop')
    expect(callToAction).toHaveValue('Compare fares')

    const coreInputsPanel = screen.getByRole('heading', { name: 'Core Inputs' })
      .closest('section')
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
    fireEvent.change(negativeInstructions, { target: { value: 'Avoid generic praise' } })
    fireEvent.click(advancedGenerationSummary)
    fireEvent.click(advancedGenerationSummary)

    fireEvent.click(advancedSeoSummary)
    fireEvent.change(secondaryKeywords, { target: { value: 'family hotels, free museums' } })
    fireEvent.click(advancedSeoSummary)
    fireEvent.click(advancedSeoSummary)

    expect(negativeInstructions).toHaveValue('Avoid generic praise')
    expect(secondaryKeywords).toHaveValue('family hotels, free museums')

    const promptProfilesPanel = screen.getByRole('heading', { name: 'Prompt Profiles' })
      .closest('section')
    const seoPanel = screen.getByRole('heading', { name: 'SEO + Constraints' })
      .closest('section')

    fireEvent.click(within(promptProfilesPanel!).getByRole('button', { name: 'Clear section' }))
    fireEvent.click(within(seoPanel!).getByRole('button', { name: 'Clear section' }))

    expect(negativeInstructions).toHaveValue('')
    expect(secondaryKeywords).toHaveValue('')
  })

  it('sends the selected model in the run payload', async () => {
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
    fireEvent.change(screen.getByLabelText('Base Draft Model'), {
      target: { value: 'gemini-2.5-pro' },
    })
    fireEvent.change(screen.getByLabelText('Source Block 1'), {
      target: { value: 'Alfama is historic. Principe Real is calmer and more upscale.' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Run Prompt2Blog Pipeline' }))

    await waitFor(() => {
      expect(startPrompt2BlogRunMock).toHaveBeenCalledWith(
        expect.objectContaining({
          article_type_id: 7,
          model_name: 'gemini-2.5-pro',
          tone_id: 'balanced',
          length_id: 'standard',
          enable_editorial_augmentation: false,
          source_material: ['Alfama is historic. Principe Real is calmer and more upscale.'],
        }),
      )
    })
  })

  it('lets users choose a travel quick pick and shows the selected definition', async () => {
    renderPage()

    const quickPick = await screen.findByRole('button', { name: 'Itinerary Article' })
    fireEvent.click(quickPick)

    expect(screen.getByLabelText('Article Type')).toHaveValue('9')
    expect(screen.getByText('Day-by-day or stop-by-stop planning format.')).toBeInTheDocument()
  })

  it('opens cleanup details from the pipeline step', async () => {
    localStorage.setItem('p2b-run-state', JSON.stringify({
      sourceStep: 'pipeline_complete',
      pipelineRunId: 'run-123',
      pipelineResult: createStoredPipelineResult(),
    }))

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
            cleaned_sources: [
              'Cleaned source one.',
              'Cleaned source two.',
            ],
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

    fireEvent.click(await screen.findByRole('button', { name: 'View clean source material details' }))

    const dialog = await screen.findByRole('dialog', { name: 'Clean source material details' })
    expect(dialog).toBeInTheDocument()
    expect(getPrompt2BlogDebugMock).toHaveBeenCalledWith('run-123')
    expect(within(dialog).getByText('ai_always_aggressive_v1')).toBeInTheDocument()
    expect(within(dialog).getByText('gemini-2.5-flash-lite')).toBeInTheDocument()
    expect(within(dialog).getByText('Is It Safe to Travel to Peru (2026 Update)')).toBeInTheDocument()
    expect(within(dialog).getByText('Travel insurance CTA')).toBeInTheDocument()
    expect(within(dialog).getByText('Fallback used')).toBeInTheDocument()
    expect(within(dialog).getByText('Cleaned source one.')).toBeInTheDocument()
    expect(within(dialog).getByText('Input: 120')).toBeInTheDocument()
    expect(within(dialog).getByText('No removed-block breakdown is available for fallback cleanup.')).toBeInTheDocument()
  })
})
