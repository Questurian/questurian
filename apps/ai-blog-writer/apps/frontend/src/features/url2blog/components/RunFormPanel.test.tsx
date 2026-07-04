/* @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RunFormPanel } from './RunFormPanel'
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
      includeDebug: true,
      setIncludeDebug: vi.fn(),
      modelName: 'gemini-2.5-flash-lite',
      setModelName: vi.fn(),
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
  it('shows URL2Blog as pinned to one writing model option', () => {
    render(<RunFormPanel run={createRun()} />)

    const select = screen.getByLabelText('Writing Model') as HTMLSelectElement
    expect(select.disabled).toBe(true)
    expect(select.value).toBe('gemini-2.5-flash-lite')
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
      'Claude Opus 4.8 for writing stages',
    ])
  })
})
