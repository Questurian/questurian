/* @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  Prompt2BlogCommission,
  Prompt2BlogEditorialOptionsResponse,
  Prompt2BlogEvidencePackage
} from '../../types/editorial.types'
import { fingerprintCommissionSync } from '../commission'
import { ResearchPanel } from './ResearchPanel'

afterEach(cleanup)

const editorialOptions: Prompt2BlogEditorialOptionsResponse = {
  schema_version: 3,
  forms: [
    {
      id: 'analysis',
      label: 'Analysis',
      description: 'Interprets evidence.',
      order: 1,
      source_requirements: []
    }
  ],
  topic_modules: [
    {
      id: 'cost-affordability',
      label: 'Cost',
      description: 'Current costs.',
      order: 1
    }
  ],
  audience_tags: [
    {
      id: 'budget-focused',
      label: 'Budget-focused',
      description: 'Watching costs.'
    }
  ],
  scope_modes: [
    {
      id: 'single_subject',
      label: 'Single subject',
      description: 'One subject.'
    }
  ],
  reference_roles: [
    {
      id: 'primary_subject',
      label: 'Primary subject',
      description: 'Article center.'
    }
  ]
}

function makeCommission(
  extraRequirements?: Array<{ requirement_id: string; question: string }>
): Prompt2BlogCommission {
  const draft = {
    schema_version: 3 as const,
    original_title: "Is Lima still South America's bargain expat capital?",
    location: 'Lima, Peru',
    approved_direction: 'Assess Lima as one subject using current evidence.',
    form_id: 'analysis' as const,
    topic_module_ids: ['cost-affordability' as const],
    audience: {
      primary_reader: 'Prospective long-stay residents',
      tags: ['budget-focused' as const]
    },
    core_reader_question: 'Does Lima still offer compelling long-stay value?',
    reader_outcome: 'Judge Lima using current evidence.',
    primary_subject: 'Lima',
    scope: {
      mode: 'single_subject' as const,
      references: [{ name: 'Lima', role: 'primary_subject' as const }]
    },
    requirements: extraRequirements
      ? [
          { requirement_id: 'r1', question: 'What do current costs show?' },
          ...extraRequirements
        ]
      : [{ requirement_id: 'r1', question: 'What do current costs show?' }],
    exclusions: [],
    call_to_action: null
  }
  return { ...draft, commission_fingerprint: fingerprintCommissionSync(draft) }
}

const commission = makeCommission()

function evidence(
  overrides: Partial<Prompt2BlogEvidencePackage> = {}
): Prompt2BlogEvidencePackage {
  return {
    schema_version: 3,
    commission_fingerprint: commission.commission_fingerprint,
    sources: [
      {
        source_id: 's1',
        title: 'Lima consumer price bulletin',
        publisher: 'Statistics office',
        url: 'https://example.com/lima-prices',
        published_at: '2026-07-01',
        retrieved_at: '2026-08-25',
        source_type: 'official',
        material_type: 'report',
        notes: ['Gives a dated current cost baseline.']
      }
    ],
    claims: [
      {
        claim_id: 'c1',
        text: 'Official figures establish a current cost baseline.',
        source_ids: ['s1'],
        requirement_ids: ['r1'],
        as_of: '2026-07-01',
        confidence: 'high'
      }
    ],
    requirements: [
      { requirement_id: 'r1', status: 'supported', claim_ids: ['c1'], gap: '' }
    ],
    conflicts: [],
    gaps: [],
    ...overrides
  }
}

function renderPanel(
  evidencePackage: Prompt2BlogEvidencePackage | null,
  handlers: {
    onStoreEvidence?: (value: Prompt2BlogEvidencePackage) => void
    onClearEvidence?: () => void
  } = {},
  activeCommission: Prompt2BlogCommission = commission
) {
  const onStoreEvidence = handlers.onStoreEvidence ?? vi.fn()
  const onClearEvidence = handlers.onClearEvidence ?? vi.fn()
  render(
    <ResearchPanel
      commission={activeCommission}
      editorialOptions={editorialOptions}
      evidencePackage={evidencePackage}
      onClearEvidence={onClearEvidence}
      onStoreEvidence={onStoreEvidence}
    />
  )
  return { onStoreEvidence, onClearEvidence }
}

function pasteEvidence(value: unknown): void {
  fireEvent.change(screen.getByLabelText('Evidence JSON'), {
    target: { value: JSON.stringify(value) }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Check evidence' }))
}

describe('ResearchPanel', () => {
  it('offers the locked research prompt for the approved commission', () => {
    renderPanel(null)

    const prompt = screen.getByLabelText('Research prompt') as HTMLTextAreaElement
    expect(prompt).toHaveAttribute('readonly')
    expect(prompt.value).toContain(commission.commission_fingerprint)
    expect(prompt.value).toContain('Lima')
  })

  it('blocks evidence that belongs to another commission', () => {
    const { onStoreEvidence } = renderPanel(null)

    pasteEvidence(evidence({ commission_fingerprint: 'a'.repeat(64) }))

    expect(screen.getByText(/nothing was attached/i)).toBeInTheDocument()
    expect(
      screen.getByText('This research belongs to a different commission.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('commission_fingerprint')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Attach research' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Attach research' }))
    expect(onStoreEvidence).not.toHaveBeenCalled()
  })

  it('attaches validated evidence exactly once', () => {
    const onStoreEvidence = vi.fn()
    renderPanel(null, { onStoreEvidence })

    pasteEvidence(evidence())
    fireEvent.click(screen.getByRole('button', { name: 'Attach research' }))

    expect(onStoreEvidence).toHaveBeenCalledTimes(1)
    expect(onStoreEvidence.mock.calls[0][0]).toMatchObject({
      commission_fingerprint: commission.commission_fingerprint
    })
  })

  it('reports readiness gaps and offers a follow-up prompt', () => {
    renderPanel(
      evidence({
        claims: [],
        requirements: [
          {
            requirement_id: 'r1',
            status: 'missing',
            claim_ids: [],
            gap: 'Current cost evidence is still missing.'
          }
        ]
      })
    )

    expect(
      screen.getByText(
        'Not ready yet — 1 question still needs an answer. Nothing ran and nothing was charged.',
      ),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/Question 1: What do current costs show\?/).length).toBeGreaterThan(0)
    expect(screen.getByText('Still unanswered')).toBeInTheDocument()
    expect(screen.queryByText('requirement_gap')).not.toBeInTheDocument()
    // The gap reads more than once on purpose: as the requirement's status, as
    // the finding that blocks the run, and inside the follow-up prompt.
    expect(
      screen.getAllByText(/Current cost evidence is still missing\./).length
    ).toBeGreaterThanOrEqual(2)
    const followUp = screen.getByLabelText(
      'Follow-up research prompt'
    ) as HTMLTextAreaElement
    expect(followUp.value).toContain('r1 — What do current costs show?')
  })

  it('hides the follow-up prompt once research is ready', () => {
    renderPanel(evidence())

    expect(screen.getByText(/Every question is answered/i)).toBeInTheDocument()
    expect(
      screen.queryByLabelText('Follow-up research prompt')
    ).not.toBeInTheDocument()
  })

  it('treats an unpublished question as settled, not as one to go back for', () => {
    const twoQuestions = makeCommission([
      { requirement_id: 'r2', question: 'How long is the customs queue?' }
    ])

    renderPanel(
      {
        ...evidence(),
        commission_fingerprint: twoQuestions.commission_fingerprint,
        requirements: [
          {
            requirement_id: 'r1',
            status: 'supported',
            claim_ids: ['c1'],
            gap: ''
          },
          {
            requirement_id: 'r2',
            status: 'unpublished',
            claim_ids: [],
            gap: 'Checked the regulator and the operator. Neither publishes it.'
          }
        ],
        gaps: []
      },
      {},
      twoQuestions
    )

    expect(
      screen.getByText(/Nobody publishes this — it was checked/)
    ).toBeInTheDocument()
    expect(screen.queryByText(/Not ready yet/)).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText('Follow-up research prompt')
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(/no published answer anywhere/)
    ).toBeInTheDocument()
  })

  it('copies the attached evidence package so it never has to be dug out of a prompt', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const attached = evidence()
    renderPanel(attached)

    fireEvent.click(
      screen.getByRole('button', { name: 'Copy evidence package' })
    )

    expect(writeText).toHaveBeenCalledWith(JSON.stringify(attached, null, 2))
    expect(
      await screen.findByRole('button', { name: 'Copied!' })
    ).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('offers nothing to copy before research is attached', () => {
    renderPanel(null)

    expect(
      screen.queryByRole('button', { name: 'Copy evidence package' })
    ).not.toBeInTheDocument()
  })

  it('removes attached research without touching the commission', () => {
    const { onClearEvidence } = renderPanel(evidence())

    fireEvent.click(screen.getByRole('button', { name: 'Remove research' }))

    expect(onClearEvidence).toHaveBeenCalledTimes(1)
    expect(
      screen.getByText(/The approved commission is unchanged/i)
    ).toBeInTheDocument()
  })
})
