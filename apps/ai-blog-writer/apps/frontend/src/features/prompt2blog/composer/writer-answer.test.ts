import { describe, expect, it } from 'vitest'
import type {
  Prompt2BlogCommission,
  Prompt2BlogEvidencePackage
} from '../types/editorial.types'
import { validateEvidencePackageValue } from './evidence-import'
import {
  recordWriterAnswer,
  removeWriterAnswer,
  writerAnsweredRequirementIds,
  writerAnswerText
} from './writer-answer'

const fingerprint =
  'd1c2c9e041513d1d2b54261f8be5a1a3904a206b9daddf5e392c81b9e7cdcf48'

const commission = {
  schema_version: 3,
  commission_fingerprint: fingerprint,
  original_title: 'Lima airport, one year on',
  location: 'Lima, Peru',
  approved_direction: 'Assess the new terminal one year in.',
  form_id: 'analysis',
  topic_module_ids: [],
  audience: { primary_reader: 'Travellers connecting through Lima', tags: [] },
  core_reader_question: 'Is the new terminal faster?',
  reader_outcome: 'Know what to expect on arrival.',
  primary_subject: 'Jorge Chávez terminal',
  scope: {
    mode: 'single_subject',
    references: [{ name: 'Jorge Chávez terminal', role: 'primary_subject' }]
  },
  requirements: [
    { requirement_id: 'r1', question: 'How long is immigration?' },
    { requirement_id: 'r2', question: 'How long does customs take?' }
  ],
  exclusions: [],
  call_to_action: null
} as unknown as Prompt2BlogCommission

function evidence(): Prompt2BlogEvidencePackage {
  return {
    schema_version: 3,
    commission_fingerprint: fingerprint,
    sources: [
      {
        source_id: 's1',
        title: 'Regulator service statistics',
        publisher: 'Regulator',
        url: 'https://example.com/stats',
        published_at: '2025-12-01',
        retrieved_at: '2026-08-25',
        source_type: 'official',
        material_type: 'report',
        notes: ['Measures immigration and baggage delivery only.']
      }
    ],
    claims: [
      {
        claim_id: 'c1',
        text: 'Immigration ran to sixty one minutes in December 2025.',
        source_ids: ['s1'],
        requirement_ids: ['r1'],
        as_of: '2025-12-01',
        confidence: 'high'
      }
    ],
    requirements: [
      { requirement_id: 'r1', status: 'supported', claim_ids: ['c1'], gap: '' },
      {
        requirement_id: 'r2',
        status: 'unpublished',
        claim_ids: [],
        gap: 'Checked the regulator and the operator. Neither measures it.'
      }
    ],
    conflicts: [],
    gaps: [
      {
        gap_id: 'g1',
        requirement_ids: ['r2'],
        summary: 'No published customs figure.'
      }
    ]
  }
}

const answered = () =>
  recordWriterAnswer(
    evidence(),
    'r2',
    'How long does customs take?',
    'Customs took twenty five minutes when I landed.',
    '2026-08-26'
  )

describe('recordWriterAnswer', () => {
  it('turns what the writer knows into first-hand evidence that answers the question', () => {
    const result = answered()

    const requirement = result.requirements.find(
      (item) => item.requirement_id === 'r2'
    )
    expect(requirement?.status).toBe('supported')
    expect(requirement?.gap).toBe('')
    expect(writerAnswerText(result, 'r2')).toBe(
      'Customs took twenty five minutes when I landed.'
    )
    expect(writerAnsweredRequirementIds(result)).toEqual(['r2'])

    const source = (result.sources ?? []).find((item) =>
      item.title.startsWith('What the writer knows:')
    )
    // The same category the pipeline already accepts for essays and interviews,
    // so it is cited and validated like any other material.
    expect(source?.source_type).toBe('firsthand')
    expect(source?.material_type).toBe('first-person-notes')
    expect(source?.retrieved_at).toBe('2026-08-26')
    expect(source?.notes).toEqual([
      'Customs took twenty five minutes when I landed.'
    ])
  })

  it('produces a package the ordinary evidence validation accepts', () => {
    // The writer's answer is not a privileged path: a package it corrupted
    // would be refused at the run, so it has to survive the same check.
    const checked = validateEvidencePackageValue(answered(), commission)

    expect(checked.issues).toEqual([])
    expect(checked.evidencePackage).not.toBeNull()
  })

  it('clears the reported gap so the next follow-up prompt cannot re-ask it', () => {
    expect(answered().gaps).toEqual([])
  })

  it('replaces an earlier answer instead of stacking a second source on it', () => {
    const corrected = recordWriterAnswer(
      answered(),
      'r2',
      'How long does customs take?',
      'Closer to forty minutes on the second trip.',
      '2026-08-27'
    )

    expect(
      (corrected.sources ?? []).filter((source) =>
        source.title.startsWith('What the writer knows:')
      )
    ).toHaveLength(1)
    expect(writerAnswerText(corrected, 'r2')).toBe(
      'Closer to forty minutes on the second trip.'
    )
    expect(validateEvidencePackageValue(corrected, commission).issues).toEqual(
      []
    )
  })

  it('refuses an empty answer and an unknown question', () => {
    expect(() =>
      recordWriterAnswer(evidence(), 'r2', 'q', '   ', '2026-08-26')
    ).toThrow('An answer cannot be empty.')
    expect(() =>
      recordWriterAnswer(evidence(), 'r9', 'q', 'Something', '2026-08-26')
    ).toThrow('No question r9 in this research.')
  })
})

describe('removeWriterAnswer', () => {
  it('takes the answer out and leaves the question open again', () => {
    const result = removeWriterAnswer(answered(), 'r2')

    const requirement = result.requirements.find(
      (item) => item.requirement_id === 'r2'
    )
    expect(requirement?.status).toBe('missing')
    expect(requirement?.claim_ids).toEqual([])
    expect(requirement?.gap).toBeTruthy()
    expect(writerAnsweredRequirementIds(result)).toEqual([])
    expect(
      (result.sources ?? []).some((source) =>
        source.title.startsWith('What the writer knows:')
      )
    ).toBe(false)
    expect(validateEvidencePackageValue(result, commission).issues).toEqual([])
  })

  it('keeps research claims that were already on the question', () => {
    const withResearch = recordWriterAnswer(
      {
        ...evidence(),
        claims: [
          ...(evidence().claims ?? []),
          {
            claim_id: 'c2',
            text: 'The operator published a target of thirty minutes.',
            source_ids: ['s1'],
            requirement_ids: ['r2'],
            as_of: '2025-12-01',
            confidence: 'medium'
          }
        ],
        requirements: [
          {
            requirement_id: 'r1',
            status: 'supported',
            claim_ids: ['c1'],
            gap: ''
          },
          {
            requirement_id: 'r2',
            status: 'partial',
            claim_ids: ['c2'],
            gap: 'A target is not a measurement.'
          }
        ],
        gaps: []
      },
      'r2',
      'How long does customs take?',
      'Customs took twenty five minutes when I landed.',
      '2026-08-26'
    )

    const result = removeWriterAnswer(withResearch, 'r2')
    const requirement = result.requirements.find(
      (item) => item.requirement_id === 'r2'
    )
    expect(requirement?.status).toBe('partial')
    expect(requirement?.claim_ids).toEqual(['c2'])
    expect(validateEvidencePackageValue(result, commission).issues).toEqual([])
  })

  it('leaves a package with no writer answer untouched', () => {
    const original = evidence()
    expect(removeWriterAnswer(original, 'r2')).toBe(original)
  })
})
