import { describe, expect, it } from 'vitest'
import { getTraceStatus, groupPipelineTrace } from './pipeline-trace.utils'

describe('pipeline trace utils', () => {
  it('groups calls by pipeline phase in first-seen order', () => {
    const groups = groupPipelineTrace([
      { stage: 'stage1_extract_article' },
      { stage: 'stage1_translate_article' },
      { stage: 'finalize_output' },
    ])

    expect(groups.map((group) => group.phase.key)).toEqual([
      'phase_1_source_extraction',
      'phase_12_finalize',
    ])
    expect(groups[0].calls).toHaveLength(2)
  })

  it('distinguishes completed, skipped, and errored calls', () => {
    expect(getTraceStatus({ stage: 'a' })).toBe('completed')
    expect(getTraceStatus({ stage: 'b', output: { skipped: true } })).toBe('skipped')
    expect(getTraceStatus({ stage: 'c', error: 'failed' })).toBe('error')
  })
})
