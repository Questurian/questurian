/* @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import legacyResultFixture from '../../../../../../../data/fixtures/prompt2blog/legacy-v2-result.json'
import type { Prompt2BlogPipelinePayload, Prompt2BlogV3PipelinePayload } from '../../api'
import { PipelineResult } from './PipelineResult'
import { PipelineV3Result } from './PipelineV3Result'

const legacyPayload = legacyResultFixture.artifact
  .pipeline_v2 as unknown as Prompt2BlogPipelinePayload

const v3Payload = {
  message: 'Prompt2Blog pipeline v3 completed',
  run_id: 'v3-run',
  schema_version: 3,
  status: 'completed',
  pipeline_status: 'ready_for_staging',
  readiness_blockers: [],
  commission: {
    original_title: "Is Lima still South America's bargain expat capital?",
    approved_direction: 'Assess whether Lima still offers strong long-stay value.',
    primary_subject: 'Lima',
  },
  form: { id: 'analysis', label: 'Analysis' },
  instruction_meta: { form_label: 'Analysis' },
  evidence_receipt: {
    source_ids: ['s1', 's2'],
    claim_ids: ['c1'],
    requirement_status: { r1: 'supported', r2: 'partial' },
  },
  improved_article: { title: 'Lima, still worth the money', content: 'Body' },
  final_markdown: '# Lima, still worth the money',
  quality_review: { quality_summary: 'Grounded and on commission.', model_used: 'claude-opus-5' },
} as unknown as Prompt2BlogV3PipelinePayload

function renderResult(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>)
}

describe('PipelineResult (legacy v2)', () => {
  it('still opens a v2 artifact recorded before v3 existed', () => {
    renderResult(
      <PipelineResult
        debugData={null}
        result={legacyPayload}
        showDebug={false}
        stageArticleUrl="/prompt2blog/stage-article?run_id=legacy-v2-run"
        onToggleDebug={() => {}}
      />,
    )

    expect(screen.getByText('Final Article Ready')).toBeTruthy()
    expect(screen.getByText('In-depth Analysis')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Stage in Payload Editor/ })).toBeTruthy()
  })
})

describe('PipelineV3Result', () => {
  it('reports the commission and the evidence the article was written from', () => {
    renderResult(
      <PipelineV3Result
        debugData={null}
        result={v3Payload}
        showDebug={false}
        stageArticleUrl="/prompt2blog/stage-article?run_id=v3-run"
        onToggleDebug={() => {}}
      />,
    )

    expect(screen.getByText('Analysis')).toBeTruthy()
    expect(screen.getByText('Lima')).toBeTruthy()
    expect(screen.getByText(/Is Lima still South America/)).toBeTruthy()
    expect(screen.getByText(/2 sources and 1 claims/)).toBeTruthy()
    expect(screen.getByText('r1')).toBeTruthy()
    expect(screen.getByText(/Answered/)).toBeTruthy()
  })

  it('names what held a run back rather than only reporting the status', () => {
    renderResult(
      <PipelineV3Result
        debugData={null}
        result={{
          ...v3Payload,
          pipeline_status: 'needs_revision',
          readiness_blockers: ['claims_grounded'],
        }}
        showDebug={false}
        stageArticleUrl={null}
        onToggleDebug={() => {}}
      />,
    )

    expect(screen.getByText('needs_revision')).toBeTruthy()
    expect(screen.getByText('claims_grounded')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Stage in Payload Editor/ })).toBeNull()
  })
})
