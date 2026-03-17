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

describe('Prompt2BlogPage', () => {
  beforeEach(() => {
    localStorage.clear()

    getPrompt2BlogInputOptionsMock.mockResolvedValue({
      article_types: [
        {
          id: 7,
          name: 'Travel Guide',
          definition: 'Explain a destination for trip planning.',
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
      name: 'Travel Guide',
      guideline: 'Lead with practical value.',
      title_guideline: 'Keep titles clear and useful.',
      guideline_file: 'Travel Guide.md',
      title_guideline_file: 'Travel Guide.md',
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
})
