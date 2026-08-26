import { describe, expect, it } from 'vitest'
import {
  plainEvidenceIssue,
  researchFindingLabel,
  researchNotReadyMessage,
  researchQuestionLabel,
  researchReadyMessage,
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

  it('still names a finding code it has never seen', () => {
    expect(researchFindingLabel('some_future_gate')).toBe('Still needs attention')
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

describe('the unpublished verdict in plain words', () => {
  it('says the question is settled rather than outstanding', () => {
    expect(researchStatusLabel('unpublished')).toBe(
      'Nobody publishes this — it was checked'
    )
  })

  it('names the backstop finding without a schema word', () => {
    expect(researchFindingLabel('nothing_answered')).toBe(
      'Nothing came back answered'
    )
  })

  it('does not claim every question was answered when one is unpublished', () => {
    expect(researchReadyMessage(0)).toContain('Every question is answered')
    expect(researchReadyMessage(1)).toContain('no published answer anywhere')
    expect(researchReadyMessage(3)).toContain('3 of them')
  })
})
