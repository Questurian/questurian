import { describe, expect, it } from 'vitest'
import type { Prompt2BlogEditorialOptionsResponse } from '../api'
import { buildDirectionPrompt } from './direction-prompt'

const catalog = {
  schema_version: 3,
  forms: [
    {
      id: 'analysis',
      label: 'Analysis',
      description: 'Interprets evidence to answer a focused question.',
      order: 2,
      source_requirements: []
    },
    {
      id: 'comparison',
      label: 'Comparison',
      description: 'Compares approved co-subjects against consistent criteria.',
      order: 12,
      source_requirements: []
    }
  ],
  topic_modules: [
    {
      id: 'cost-affordability',
      label: 'Cost and affordability',
      description: 'Constrains cost evidence and comparisons.',
      order: 1
    }
  ],
  audience_tags: [
    {
      id: 'budget-focused',
      label: 'Budget-focused',
      description: 'Prioritizes costs and value.'
    }
  ],
  scope_modes: [
    {
      id: 'single_subject',
      label: 'Single subject',
      description: 'Keeps one subject primary.'
    }
  ],
  reference_roles: [
    {
      id: 'primary_subject',
      label: 'Primary subject',
      description: 'The controlling subject.'
    },
    {
      id: 'context_only',
      label: 'Context only',
      description: 'Cannot organize the article.'
    }
  ]
} satisfies Prompt2BlogEditorialOptionsResponse

describe('buildDirectionPrompt', () => {
  it('asks for exactly three fixed editorial options from the v3 catalog', () => {
    const prompt = buildDirectionPrompt(
      "Is Lima still South America's bargain expat capital?",
      'Lima, Peru',
      catalog
    )

    expect(prompt).toContain(
      `Original title: "Is Lima still South America's bargain expat capital?"`
    )
    expect(prompt).toContain('Location: "Lima, Peru"')
    expect(prompt).toContain(
      'exactly three materially different editorial options'
    )
    expect(prompt.match(/"direction-[123]"/g)).toEqual([
      '"direction-1"',
      '"direction-2"',
      '"direction-3"'
    ])
    expect(prompt).toContain('- analysis (Analysis) — Interprets evidence')
    expect(prompt).toContain('- cost-affordability (Cost and affordability)')
    expect(prompt).toContain('- budget-focused (Budget-focused)')
    expect(prompt).toContain('- single_subject (Single subject)')
    expect(prompt).toContain('- context_only (Context only)')
  })

  it('keeps direction generation separate from research and legacy controls', () => {
    const prompt = buildDirectionPrompt(
      'A weekend in Lisbon',
      'Lisbon, Portugal',
      catalog
    )

    expect(prompt).toContain(
      'Do not browse, research facts, or write the article'
    )
    expect(prompt).toContain('required research questions')
    expect(prompt).toContain(
      'Context-only references cannot become co-subjects'
    )
    expect(prompt).not.toContain('tone_id')
    expect(prompt).not.toContain('article_type')
    expect(prompt).not.toContain('source_material')
  })

  it('quotes untrusted title and location text as JSON strings', () => {
    const prompt = buildDirectionPrompt(
      'The "quiet" side of Lima',
      'Lima "Centro"',
      catalog
    )

    expect(prompt).toContain('Original title: "The \\"quiet\\" side of Lima"')
    expect(prompt).toContain('Location: "Lima \\"Centro\\""')
  })
})
