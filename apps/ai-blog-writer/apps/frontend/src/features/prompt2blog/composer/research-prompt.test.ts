import { describe, expect, it } from 'vitest'
import type {
  Prompt2BlogCommission,
  Prompt2BlogEditorialOptionsResponse
} from '../api'
import { buildResearchPrompt } from './research-prompt'

const commission: Prompt2BlogCommission = {
  schema_version: 3,
  commission_fingerprint:
    'd1c2c9e041513d1d2b54261f8be5a1a3904a206b9daddf5e392c81b9e7cdcf48',
  original_title: "Is Lima still South America's bargain expat capital?",
  location: 'Lima, Peru',
  approved_direction:
    'Assess Lima as one long-stay subject without turning context cities into co-subjects.',
  form_id: 'feature-profile',
  topic_module_ids: ['cost-affordability', 'long-stay-remote-work'],
  audience: {
    primary_reader: 'Prospective expats and remote workers',
    tags: ['remote-worker-relocator', 'budget-focused']
  },
  core_reader_question: 'Does Lima still deliver compelling long-stay value?',
  reader_outcome: 'Judge Lima using current evidence and explicit tradeoffs.',
  primary_subject: 'Lima',
  scope: {
    mode: 'single_subject',
    references: [
      { name: 'Lima', role: 'primary_subject' },
      { name: 'Medellín', role: 'context_only' }
    ]
  },
  requirements: [
    { requirement_id: 'r1', question: 'What do current routine costs show?' },
    {
      requirement_id: 'r2',
      question: 'Which reported people and scenes establish lived context?'
    }
  ],
  exclusions: ['Do not organize the article as a city comparison.'],
  call_to_action: null
}

const catalog: Prompt2BlogEditorialOptionsResponse = {
  schema_version: 3,
  forms: [
    {
      id: 'feature-profile',
      label: 'Feature/Profile',
      description: 'Reported narrative using people, scenes, and quotations.',
      order: 4,
      source_requirements: ['reported-people-scenes-quotations']
    }
  ],
  topic_modules: [
    {
      id: 'cost-affordability',
      label: 'Cost and affordability',
      description:
        'Use current, comparable price evidence with dated assumptions.',
      order: 1
    },
    {
      id: 'long-stay-remote-work',
      label: 'Long stay and remote work',
      description: 'Verify practical long-stay rules and infrastructure.',
      order: 9
    },
    {
      id: 'food-drink',
      label: 'Food and drink',
      description: 'Inactive module that must not broaden this research.',
      order: 3
    }
  ],
  audience_tags: [],
  scope_modes: [],
  reference_roles: []
}

describe('buildResearchPrompt', () => {
  it('locks authority and requests one exact bare evidence package', () => {
    const prompt = buildResearchPrompt(commission, catalog)

    expect(prompt).toContain(
      `"commission_fingerprint": "${commission.commission_fingerprint}"`
    )
    expect(prompt).toContain('The commission is read-only authority')
    expect(prompt).toContain(
      'Do not change the form, primary subject, scope, reference roles'
    )
    expect(prompt).toContain('Do not add a comparator')
    expect(prompt).toContain('Return one bare JSON object and nothing else')
    expect(prompt).toContain(
      '"material_type": "web|report|transcript|interview-responses|first-person-notes|evaluation-notes|other"'
    )
    expect(prompt).toContain(
      'Set requirement status and claim confidence by the rules below.'
    )
    expect(prompt).toContain(
      'Every commission requirement ID must appear exactly once'
    )
    expect(prompt).not.toContain('"commission": {')
  })

  it('separates requirement status from claim confidence so an unreachable primary source cannot stall the loop', () => {
    const prompt = buildResearchPrompt(commission, catalog)

    expect(prompt).toContain('REQUIREMENT STATUS VERSUS CLAIM CONFIDENCE')
    expect(prompt).toContain('status describes the QUESTION')
    expect(prompt).toContain('confidence describes the ANSWER')
    expect(prompt).toContain(
      'the publisher blocks automated retrieval, or you would have preferred more evidence'
    )
    expect(prompt).toContain(
      'Never downgrade the requirement to partial for it.'
    )
    expect(prompt).toContain(
      'Reserve partial and missing for a genuinely unanswered question.'
    )
    expect(prompt).toContain(
      'otherwise say exactly which part of the question is still unanswered'
    )
  })

  it('includes only active module metadata and the active form source gate', () => {
    const prompt = buildResearchPrompt(commission, catalog)

    expect(prompt).toContain(
      'reported-people-scenes-quotations — Require attributable people, documented scenes, and exact supported quotations.'
    )
    expect(prompt).toContain(
      'cost-affordability (Cost and affordability) — Use current, comparable price evidence with dated assumptions.'
    )
    expect(prompt).toContain(
      'long-stay-remote-work (Long stay and remote work) — Verify practical long-stay rules and infrastructure.'
    )
    expect(prompt).not.toContain(
      'Inactive module that must not broaden this research.'
    )
  })
})
