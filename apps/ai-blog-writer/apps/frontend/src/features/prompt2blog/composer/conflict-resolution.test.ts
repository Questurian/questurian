import { describe, expect, it } from 'vitest'
import type { Prompt2BlogEvidencePackage } from '../types/editorial.types'
import {
  clearConflictResolution,
  resolveConflict,
  unresolvedConflicts
} from './conflict-resolution'

function evidence(): Prompt2BlogEvidencePackage {
  return {
    schema_version: 3,
    commission_fingerprint: 'abc',
    sources: [],
    claims: [
      {
        claim_id: 'c1',
        text: 'Maido asks for reservations two months ahead.',
        source_ids: ['s1'],
        requirement_ids: ['r5'],
        as_of: '2026-08-01',
        confidence: 'medium'
      },
      {
        claim_id: 'c2',
        text: 'Maido asks for reservations 90 days ahead.',
        source_ids: ['s1'],
        requirement_ids: ['r5'],
        as_of: '2026-08-01',
        confidence: 'medium'
      }
    ],
    requirements: [
      { requirement_id: 'r5', status: 'supported', claim_ids: ['c1', 'c2'], gap: '' }
    ],
    premise_findings: [],
    conflicts: [
      {
        conflict_id: 'x1',
        claim_ids: ['c1', 'c2'],
        summary: "Maido's English and Spanish pages disagree.",
        resolution: null
      }
    ],
    gaps: []
  }
}

describe('resolveConflict', () => {
  it('settles a conflict without touching either claim', () => {
    const before = evidence()

    const after = resolveConflict(before, 'x1', '  The Spanish page is authoritative: 90 days.  ')

    expect(after.conflicts?.[0].resolution).toBe(
      'The Spanish page is authoritative: 90 days.'
    )
    expect(after.claims).toEqual(before.claims)
    expect(after.requirements).toEqual(before.requirements)
  })

  it('adds no source and no claim, because nothing was found', () => {
    // The whole point: both sides are already sourced. What was missing is a
    // decision, and a decision is not evidence.
    const after = resolveConflict(evidence(), 'x1', 'Follow the Spanish page.')

    expect(after.sources).toHaveLength(0)
    expect(after.claims).toHaveLength(2)
  })

  it('refuses an empty resolution', () => {
    expect(() => resolveConflict(evidence(), 'x1', '   ')).toThrow(
      'A resolution cannot be empty.'
    )
  })

  it('refuses a conflict this research never reported', () => {
    expect(() => resolveConflict(evidence(), 'x9', 'Follow the Spanish page.')).toThrow(
      'No conflict x9 in this research.'
    )
  })

  it('leaves other conflicts alone', () => {
    const before = evidence()
    before.conflicts = [
      ...(before.conflicts ?? []),
      {
        conflict_id: 'x2',
        claim_ids: ['c1', 'c2'],
        summary: 'A second disagreement.',
        resolution: null
      }
    ]

    const after = resolveConflict(before, 'x1', 'Follow the Spanish page.')

    expect(after.conflicts?.[1].resolution).toBeNull()
  })
})

describe('clearConflictResolution', () => {
  it('puts a settled conflict back in dispute with both claims intact', () => {
    const settled = resolveConflict(evidence(), 'x1', 'Follow the Spanish page.')

    const reopened = clearConflictResolution(settled, 'x1')

    expect(reopened.conflicts?.[0].resolution).toBeNull()
    expect(reopened.claims).toHaveLength(2)
  })
})

describe('unresolvedConflicts', () => {
  it('reports each open conflict with the claim texts under dispute', () => {
    expect(unresolvedConflicts(evidence())).toEqual([
      {
        conflictId: 'x1',
        summary: "Maido's English and Spanish pages disagree.",
        claims: [
          'Maido asks for reservations two months ahead.',
          'Maido asks for reservations 90 days ahead.'
        ]
      }
    ])
  })

  it('drops one the operator already settled', () => {
    const settled = resolveConflict(evidence(), 'x1', 'Follow the Spanish page.')

    expect(unresolvedConflicts(settled)).toEqual([])
  })

  it('treats whitespace as unsettled, matching the gate', () => {
    const value = evidence()
    value.conflicts = [{ ...value.conflicts![0], resolution: '   ' }]

    expect(unresolvedConflicts(value)).toHaveLength(1)
  })

  it('falls back to the claim id when a claim is missing', () => {
    const value = evidence()
    value.claims = []

    expect(unresolvedConflicts(value)[0].claims).toEqual(['c1', 'c2'])
  })
})
