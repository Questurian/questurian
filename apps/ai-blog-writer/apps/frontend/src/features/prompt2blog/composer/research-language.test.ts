import { describe, expect, it } from 'vitest'
import {
  plainEvidenceIssue,
  researchFindingLabel,
  researchNotReadyMessage,
  researchQuestionLabel,
  researchStatusLabel,
} from './research-language'

describe('research language', () => {
  it('turns requirement ids into the actual numbered question', () => {
    expect(
      researchQuestionLabel('r2', [
        { requirement_id: 'r2', question: 'Which tradeoffs change the value judgment?' },
      ])
    ).toBe('Question 2: Which tradeoffs change the value judgment?')
  })

  it('names gate findings without backend codes', () => {
    expect(researchFindingLabel('requirement_gap')).toBe('Still unanswered')
    expect(researchFindingLabel('unresolved_conflict')).toBe('Two sources disagree')
    expect(researchFindingLabel('source_gate')).toBe(
      'This kind of article needs a first-hand source'
    )
  })

  it('keeps a half-answered question distinct from an unanswered one', () => {
    expect(researchStatusLabel('supported')).toBe('Answered')
    expect(researchStatusLabel('partial')).toBe('Partly answered')
    expect(researchStatusLabel('missing')).toBe('Still unanswered')
  })

  it('states that an incomplete run spent nothing', () => {
    expect(researchNotReadyMessage(2)).toBe(
      'Not ready yet — 2 questions still need answers. Nothing ran and nothing was charged.'
    )
  })

  it('hides the internal fingerprint field name', () => {
    expect(plainEvidenceIssue('commission_fingerprint', 'Must match.')).toEqual({
      label: null,
      message: 'This research belongs to a different commission.',
    })
  })
})
