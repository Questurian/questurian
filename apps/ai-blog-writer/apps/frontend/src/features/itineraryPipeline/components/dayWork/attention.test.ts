import { describe, expect, it } from 'vitest'
import { plainIssueMessage, withVenues, type StopNames } from './attention'

const names: StopNames = {
  labels: new Map([
    ['s1', 'Signature lunch'],
    ['s2', 'Neighborhood walk'],
  ]),
  venueByLabel: new Map([['Signature lunch', 'El Mercado']]),
}

describe('attention wording', () => {
  it('calls a suggestion a suggestion, not a change to the layout', () => {
    expect(plainIssueMessage('Proposed change to the layout: Call ahead. — Hours vary')).toBe(
      'Suggestion: Call ahead. — Hours vary',
    )
    expect(plainIssueMessage('Lunch: closed on Mondays.')).toBe('Lunch: closed on Mondays.')
  })

  it('names a leg by its venues where they are known, and by its job otherwise', () => {
    expect(withVenues('Signature lunch → Neighborhood walk', names)).toBe(
      'El Mercado → Neighborhood walk',
    )
    expect(withVenues('Not a leg', names)).toBe('Not a leg')
  })
})
