import { describe, expect, it } from 'vitest'
import type {
  Prompt2BlogCommission,
  Prompt2BlogEditorialOptionsResponse,
  Prompt2BlogEvidencePackage
} from '../api'
import limaFixture from '../../../../../../data/fixtures/prompt2blog/lima-scope-drift-v3.json'
import { reviewEvidencePackageJson } from './evidence-import'

const fingerprint =
  'd1c2c9e041513d1d2b54261f8be5a1a3904a206b9daddf5e392c81b9e7cdcf48'

const commission: Prompt2BlogCommission = {
  schema_version: 3,
  commission_fingerprint: fingerprint,
  original_title: "Is Lima still South America's bargain expat capital?",
  location: 'Lima, Peru',
  approved_direction:
    'Assess Lima as one subject using current long-stay evidence.',
  form_id: 'analysis',
  topic_module_ids: ['cost-affordability'],
  audience: {
    primary_reader: 'Prospective long-stay residents',
    tags: ['budget-focused']
  },
  core_reader_question: 'Does Lima still offer compelling long-stay value?',
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
      question: 'Which tradeoffs change the value judgment?'
    }
  ],
  exclusions: ['Do not make Medellín a co-subject.'],
  call_to_action: null
}

const catalog: Prompt2BlogEditorialOptionsResponse = {
  schema_version: 3,
  forms: [
    {
      id: 'analysis',
      label: 'Analysis',
      description: 'Evidence-led interpretation.',
      order: 2,
      source_requirements: []
    },
    {
      id: 'interview-qa',
      label: 'Interview/Q&A',
      description: 'Attributable answers.',
      order: 5,
      source_requirements: ['attributable-responses']
    },
    {
      id: 'personal-essay-travelogue',
      label: 'Personal Essay/Travelogue',
      description: 'Supplied lived experience.',
      order: 7,
      source_requirements: ['first-person-material']
    },
    {
      id: 'review',
      label: 'Review',
      description: 'Documented evaluation.',
      order: 13,
      source_requirements: ['documented-evaluation']
    },
    {
      id: 'feature-profile',
      label: 'Feature/Profile',
      description: 'Reported people, scenes, and quotations.',
      order: 4,
      source_requirements: ['reported-people-scenes-quotations']
    }
  ],
  topic_modules: [
    {
      id: 'cost-affordability',
      label: 'Cost and affordability',
      description: 'Current dated cost evidence.',
      order: 1
    }
  ],
  audience_tags: [],
  scope_modes: [],
  reference_roles: []
}

function evidence(): Prompt2BlogEvidencePackage {
  return {
    schema_version: 3,
    commission_fingerprint: fingerprint,
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
        notes: ['Provides a dated current cost baseline.']
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
      { requirement_id: 'r1', status: 'supported', claim_ids: ['c1'], gap: '' },
      {
        requirement_id: 'r2',
        status: 'missing',
        claim_ids: [],
        gap: 'Current quality-of-life evidence is still needed.'
      }
    ],
    conflicts: [],
    gaps: [
      {
        gap_id: 'g1',
        requirement_ids: ['r2'],
        summary: 'Find current evidence for practical tradeoffs.'
      }
    ]
  }
}

function review(value: unknown, activeCommission = commission) {
  return reviewEvidencePackageJson(
    JSON.stringify(value),
    activeCommission,
    catalog
  )
}

describe('reviewEvidencePackageJson', () => {
  it('keeps the permanent Lima scope-drift fixture importable with explicit gaps', () => {
    const result = reviewEvidencePackageJson(
      JSON.stringify(limaFixture.evidence_package),
      limaFixture.commission as unknown as Prompt2BlogCommission,
      catalog
    )

    expect(result.issues).toEqual([])
    expect(result.readinessFindings).toHaveLength(2)
    expect(
      result.readinessFindings.map((finding) => finding.requirement_ids)
    ).toEqual([['r2'], ['r3']])
  })

  it('imports honest incomplete evidence and reports readiness without replacing commission', () => {
    const result = review(evidence())

    expect(result.issues).toEqual([])
    expect(result.evidencePackage).toEqual(evidence())
    expect(result.evidencePackage).not.toHaveProperty('commission')
    expect(result.readinessFindings).toEqual([
      {
        code: 'requirement_gap',
        requirement_ids: ['r2'],
        message: 'Current quality-of-life evidence is still needed.'
      }
    ])
  })

  it('lets an unpublished question through the gate with the record of what was checked', () => {
    // The Lima block: no agency publishes a customs-processing figure, for
    // either terminal, so `partial` sent the operator back to ask forever.
    const value = evidence()
    value.requirements[1] = {
      requirement_id: 'r2',
      status: 'unpublished',
      claim_ids: [],
      gap: 'Checked the regulator, the operator, and the customs authority. None publishes it.'
    }
    value.gaps = []

    const result = review(value)

    expect(result.issues).toEqual([])
    expect(result.readinessFindings).toEqual([])
  })

  it('refuses an unpublished question that does not say what was checked', () => {
    const value = evidence()
    value.requirements[1] = {
      requirement_id: 'r2',
      status: 'unpublished',
      claim_ids: [],
      gap: '   '
    }

    expect(review(value).issues).toContainEqual({
      path: 'requirements[1]',
      message:
        'Unpublished requirements need a non-empty gap naming what was checked.'
    })
  })

  it('still blocks a package where nothing at all came back answered', () => {
    // Otherwise a research desk escapes the gate by declaring every question
    // unpublished, and the article is written from nothing.
    const value = evidence()
    value.claims = []
    value.requirements = [
      {
        requirement_id: 'r1',
        status: 'unpublished',
        claim_ids: [],
        gap: 'Checked every authority that could publish this.'
      },
      {
        requirement_id: 'r2',
        status: 'unpublished',
        claim_ids: [],
        gap: 'Checked every authority that could publish this.'
      }
    ]
    value.gaps = []

    expect(review(value).readinessFindings).toEqual([
      {
        code: 'nothing_answered',
        requirement_ids: ['r1', 'r2'],
        message: 'No question was answered, so there is nothing to write from.'
      }
    ])
  })

  it('requires one bare exact evidence object with the approved fingerprint', () => {
    const fenced = reviewEvidencePackageJson(
      `\`\`\`json\n${JSON.stringify(evidence())}\n\`\`\``,
      commission,
      catalog
    )
    expect(fenced.issues[0].path).toBe('json')

    const wrong = evidence()
    wrong.commission_fingerprint = '0'.repeat(64)
    expect(review(wrong).issues).toContainEqual({
      path: 'commission_fingerprint',
      message: 'Must match the currently approved commission.'
    })

    const authority = {
      ...evidence(),
      commission,
      form_id: 'comparison',
      scope: {}
    }
    const paths = review(authority).issues.map((issue) => issue.path)
    expect(paths).toEqual(
      expect.arrayContaining(['commission', 'form_id', 'scope'])
    )
  })

  it('requires the exact commission requirement set and resolvable unique links', () => {
    const value = evidence()
    value.requirements = [value.requirements[0]]
    value.claims![0].source_ids = ['missing-source', 'missing-source']
    value.gaps![0].requirement_ids = ['r9']

    const result = review(value)

    expect(result.evidencePackage).toBeNull()
    expect(result.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        'Requirement IDs must exactly match the approved commission.',
        'Values must be unique.',
        'Unknown source ID.',
        'Unknown requirement ID.'
      ])
    )
  })

  it('requires stable source, claim, conflict, and gap IDs', () => {
    const value = evidence()
    value.sources![0].source_id = 'source-one'
    value.claims![0].claim_id = 'claim-one'
    value.gaps![0].gap_id = 'gap-one'
    value.conflicts = [
      {
        conflict_id: 'conflict-one',
        claim_ids: ['c1', 'c2'],
        summary: 'Unresolved discrepancy.',
        resolution: null
      }
    ]

    expect(review(value).issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        'Must use the stable s1, s2, … format.',
        'Must use the stable c1, c2, … format.',
        'Must use the stable x1, x2, … format.',
        'Must use the stable g1, g2, … format.'
      ])
    )
  })

  it('requires reciprocal claim and requirement mappings', () => {
    const value = evidence()
    value.requirements[0].claim_ids = []

    expect(review(value).issues).toContainEqual({
      path: 'claims[0].requirement_ids',
      message: 'Requirement r1 does not link back to c1.'
    })

    const reverse = evidence()
    reverse.claims![0].requirement_ids = ['r2']
    expect(review(reverse).issues).toContainEqual({
      path: 'requirements[0].claim_ids',
      message: 'Claim c1 does not link back to r1.'
    })
  })

  it('validates real dates, HTTP metadata, and useful source notes', () => {
    const value = evidence()
    const source = value.sources![0]
    source.published_at = '2026-02-30'
    source.retrieved_at = '25-08-2026'
    source.url = 'file:///tmp/source'
    source.publisher = null
    source.notes = []

    const messages = review(value).issues.map((issue) => issue.message)

    expect(messages).toEqual(
      expect.arrayContaining([
        'Must be a real YYYY-MM-DD date or null.',
        'Must be a real YYYY-MM-DD date.',
        'Must be an HTTP(S) URL or null.',
        'Must contain at least 1 item(s).',
        'Web and report sources require publisher and URL metadata.'
      ])
    )
  })

  it.each([
    ['supported', [], '', 'Supported requirements need claims and an empty gap.'],
    ['partial', ['c1'], '', 'Partial requirements need a non-empty gap.'],
    [
      'missing',
      ['c1'],
      'Missing',
      'Missing requirements need no claims and a non-empty gap.'
    ],
    [
      'missing',
      [],
      '',
      'Missing requirements need no claims and a non-empty gap.'
    ]
  ])('enforces %s status semantics', (status, claimIds, gap, message) => {
    const value = evidence()
    value.requirements[0] = {
      requirement_id: 'r1',
      status: status as 'supported',
      claim_ids: claimIds,
      gap
    }
    expect(review(value).issues.map((issue) => issue.message)).toContain(
      message
    )
  })

  it('allows partial requirements with an explicit gap before any claim is usable', () => {
    const value = evidence()
    value.requirements[1] = {
      requirement_id: 'r2',
      status: 'partial',
      claim_ids: [],
      gap: 'Available material is relevant but not yet claim-ready.'
    }

    expect(review(value).issues).toEqual([])
  })

  it('validates conflict and gap references while allowing unresolved conflicts', () => {
    const value = evidence()
    value.claims!.push({
      claim_id: 'c2',
      text: 'A second source disagrees with the baseline.',
      source_ids: ['s1'],
      requirement_ids: ['r1'],
      as_of: '2026-07-01',
      confidence: 'medium'
    })
    value.requirements[0].claim_ids = ['c1', 'c2']
    value.conflicts = [
      {
        conflict_id: 'x1',
        claim_ids: ['c1', 'c2'],
        summary: 'Current estimates disagree.',
        resolution: null
      }
    ]

    const result = review(value)
    expect(result.issues).toEqual([])
    expect(result.readinessFindings).toContainEqual({
      code: 'unresolved_conflict',
      requirement_ids: ['r1'],
      message: 'Current estimates disagree.'
    })

    value.conflicts[0].claim_ids = ['c1', 'unknown']
    expect(review(value).issues).toContainEqual({
      path: 'conflicts[0].claim_ids[1]',
      message: 'Unknown claim ID.'
    })
  })

  it.each([
    ['interview-qa', 'transcript', 'report'],
    ['personal-essay-travelogue', 'first-person-notes', 'report'],
    ['review', 'evaluation-notes', 'report'],
    ['feature-profile', 'interview-responses', 'report']
  ] as const)(
    'reports the %s source gate deterministically',
    (formId, satisfyingMaterial, weakMaterial) => {
      const activeCommission: Prompt2BlogCommission = {
        ...commission,
        form_id: formId
      }
      const weak = evidence()
      weak.sources![0].material_type = weakMaterial
      expect(review(weak, activeCommission).readinessFindings).toContainEqual(
        expect.objectContaining({ code: 'source_gate' })
      )

      const strong = evidence()
      strong.sources![0].material_type = satisfyingMaterial
      if (formId === 'feature-profile')
        strong.sources![0].source_type = 'reporting'
      expect(
        review(strong, activeCommission).readinessFindings
      ).not.toContainEqual(expect.objectContaining({ code: 'source_gate' }))
    }
  )

  it('keeps the feature-profile gate unsatisfied without a reported or firsthand source', () => {
    const activeCommission: Prompt2BlogCommission = {
      ...commission,
      form_id: 'feature-profile'
    }
    const value = evidence()
    value.sources![0].material_type = 'interview-responses'
    value.sources![0].source_type = 'official'

    expect(review(value, activeCommission).readinessFindings).toContainEqual({
      code: 'source_gate',
      requirement_ids: [],
      message:
        'The feature-profile form still needs reported-people-scenes-quotations.'
    })
  })

  it('rejects a supported requirement that still declares a gap', () => {
    const value = evidence()
    value.requirements[0].gap = 'Still missing a second baseline.'

    expect(review(value).issues).toContainEqual({
      path: 'requirements[0]',
      message: 'Supported requirements need claims and an empty gap.'
    })
  })
})
