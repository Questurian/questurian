import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as prompt2blogApi from './api'
import { DEFAULT_PROMPT2BLOG_MODEL } from './constants/prompt2blog.constants'
import Prompt2BlogPage from './Prompt2BlogPage'

vi.mock('./api', () => ({
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
  return render(
    <MemoryRouter>
      <Prompt2BlogPage />
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

  it('defaults the writing model selector to flash lite', async () => {
    renderPage()

    const modelSelect = await screen.findByLabelText('Writing Model')

    expect(modelSelect).toHaveValue(DEFAULT_PROMPT2BLOG_MODEL)
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
    fireEvent.change(screen.getByLabelText('Writing Model'), {
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

    expect(await screen.findByRole('dialog', { name: 'Clean source material details' })).toBeInTheDocument()
    expect(getPrompt2BlogDebugMock).toHaveBeenCalledWith('run-123')
    expect(screen.getByText('ai_always_aggressive_v1')).toBeInTheDocument()
    expect(screen.getByText('gemini-2.5-flash-lite')).toBeInTheDocument()
    expect(screen.getByText('Is It Safe to Travel to Peru (2026 Update)')).toBeInTheDocument()
    expect(screen.getByText('Travel insurance CTA')).toBeInTheDocument()
    expect(screen.getByText('Fallback used')).toBeInTheDocument()
    expect(screen.getByText('Cleaned source one.')).toBeInTheDocument()
    expect(screen.getByText('Input: 120')).toBeInTheDocument()
    expect(screen.getByText('No removed-block breakdown is available for fallback cleanup.')).toBeInTheDocument()
  })
})
