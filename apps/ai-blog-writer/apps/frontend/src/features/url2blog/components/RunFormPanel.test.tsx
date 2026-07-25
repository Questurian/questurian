/* @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RunFormPanel } from './RunFormPanel'
import { DEFAULT_ARTICLE_TONE_ID } from '../../../shared/api/ai/models'
import {
  URL2BLOG_DEFAULT_WRITER_MODEL,
  URL2BLOG_WRITER_MODEL_OPTIONS,
} from '../constants/pipeline-ui.constants'
import type { useUrl2BlogRun } from '../hooks/useUrl2BlogRun'
import type { FormEvent } from 'react'

type RunFormPanelRun = ReturnType<typeof useUrl2BlogRun>

function createRun(overrides: Partial<RunFormPanelRun> = {}): RunFormPanelRun {
  const run = {
    input: {
      inputMode: 'url',
      setInputMode: vi.fn(),
      url: 'https://example.com/article',
      setUrl: vi.fn(),
      pastedText: '',
      setPastedText: vi.fn(),
      inputError: null,
      setInputError: vi.fn(),
      handleSubmit: vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault()),
    },
    config: {
      selectedNarrativeFocusPresetId: '',
      setSelectedNarrativeFocusPresetId: vi.fn(),
      customNarrativeFocus: '',
      setCustomNarrativeFocus: vi.fn(),
      narrativeFocus: '',
      toneId: DEFAULT_ARTICLE_TONE_ID,
      setToneId: vi.fn(),
      toneProfiles: [],
      articleTypes: [],
      includeDebug: true,
      setIncludeDebug: vi.fn(),
      modelName: 'gemini-2.5-flash-lite',
      setModelName: vi.fn(),
      writingModel: URL2BLOG_DEFAULT_WRITER_MODEL,
      setWritingModel: vi.fn(),
      executionProfile: 'standard',
      setExecutionProfile: vi.fn(),
    },
    pipeline: {
      activeRunId: null,
      activeStatus: null,
      liveStageLabel: null,
      processingSteps: [],
      statusQuery: {},
      statusErrorMessage: null,
      mutationErrorMessage: null,
      pipelineMutation: {
        isPending: false,
        isError: false,
      },
      currentStep: 'input',
      result: null,
      handleStartOver: vi.fn(),
    },
    ...overrides,
  }

  return run as RunFormPanelRun
}

describe('RunFormPanel', () => {
  it('offers the full writing model list and defaults to the premier writer', () => {
    render(<RunFormPanel run={createRun()} />)

    const select = screen.getByLabelText('Writing Model') as HTMLSelectElement
    expect(select.disabled).toBe(false)
    expect(select.value).toBe(URL2BLOG_DEFAULT_WRITER_MODEL)
    expect(Array.from(select.options).map((option) => option.value)).toEqual(
      URL2BLOG_WRITER_MODEL_OPTIONS.map((option) => option.value),
    )
  })
})
