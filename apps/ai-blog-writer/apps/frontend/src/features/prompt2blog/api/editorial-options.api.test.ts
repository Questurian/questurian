import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prompt2BlogEditorialOptionsResponse } from '../types/editorial.types'
import { getPrompt2BlogEditorialOptions } from './editorial-options.api'

const fetchMock = vi.fn()

const editorialOptions = {
  schema_version: 3,
  forms: [
    {
      id: 'analysis',
      label: 'Analysis',
      description: 'Interprets evidence to answer a focused question.',
      order: 2,
      source_requirements: [],
    },
    {
      id: 'interview-qa',
      label: 'Interview/Q&A',
      description: 'Builds an article from attributable responses.',
      order: 5,
      source_requirements: ['attributable-responses'],
    },
  ],
  topic_modules: [
    {
      id: 'cost-affordability',
      label: 'Cost and affordability',
      description: 'Constrains cost evidence and comparisons.',
      order: 1,
    },
  ],
  audience_tags: [
    {
      id: 'budget-focused',
      label: 'Budget-focused',
      description: 'Prioritizes costs and value.',
    },
  ],
  scope_modes: [
    {
      id: 'single_subject',
      label: 'Single subject',
      description: 'Keeps one subject primary.',
    },
  ],
  reference_roles: [
    {
      id: 'context_only',
      label: 'Context only',
      description: 'Provides context without becoming a co-subject.',
    },
  ],
} satisfies Prompt2BlogEditorialOptionsResponse

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  }
}

describe('getPrompt2BlogEditorialOptions', () => {
  it('fetches and returns the isolated Prompt2Blog v3 editorial catalog', async () => {
    fetchMock.mockResolvedValue(jsonResponse(editorialOptions))

    await expect(getPrompt2BlogEditorialOptions()).resolves.toEqual(editorialOptions)

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('http://localhost:4003/prompt2blog/editorial-options')
    expect(init.credentials).toBe('include')
  })

  it('surfaces the backend error detail', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'Editorial catalog unavailable' }, false))

    await expect(getPrompt2BlogEditorialOptions()).rejects.toThrow(
      'Editorial catalog unavailable',
    )
  })
})
