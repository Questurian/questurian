/* @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  Prompt2BlogCommissionDraft,
  Prompt2BlogDirectionOption,
  Prompt2BlogEditorialOptionsResponse
} from '../../types/editorial.types'
import { CommissionEditor } from './CommissionEditor'
import { DirectionCards } from './DirectionCards'

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
    },
    {
      id: 'comparison',
      label: 'Comparison',
      description: 'Compares peers.',
      order: 2,
      source_requirements: []
    },
    {
      id: 'explainer',
      label: 'Explainer',
      description: 'Explains a question.',
      order: 3,
      source_requirements: []
    }
  ],
  topic_modules: [
    {
      id: 'cost-affordability',
      label: 'Cost',
      description: 'Current costs.',
      order: 1
    },
    {
      id: 'accommodation-neighborhoods',
      label: 'Accommodation',
      description: 'Where to live.',
      order: 2
    },
    { id: 'food-drink', label: 'Food', description: 'Eating costs.', order: 3 },
    {
      id: 'long-stay-remote-work',
      label: 'Long stay',
      description: 'Remote work.',
      order: 4
    },
    { id: 'safety', label: 'Safety', description: 'Current risks.', order: 5 }
  ],
  audience_tags: [
    {
      id: 'remote-worker-relocator',
      label: 'Relocator',
      description: 'Planning a move.'
    },
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
    },
    { id: 'head_to_head', label: 'Head to head', description: 'Two peers.' },
    {
      id: 'ranked_set',
      label: 'Ranked set',
      description: 'Three or more peers.'
    }
  ],
  reference_roles: [
    {
      id: 'primary_subject',
      label: 'Primary subject',
      description: 'Article center.'
    },
    {
      id: 'context_only',
      label: 'Context only',
      description: 'Benchmark only.'
    },
    { id: 'comparator', label: 'Comparator', description: 'Co-subject.' }
  ]
}

function makeDirection(
  optionId: Prompt2BlogDirectionOption['option_id'],
  formId: Prompt2BlogDirectionOption['form_id'],
  direction: string
): Prompt2BlogDirectionOption {
  return {
    option_id: optionId,
    direction,
    form_id: formId,
    topic_module_ids: ['cost-affordability'],
    audience: {
      primary_reader:
        'Remote workers deciding whether Lima still offers value.',
      tags: ['remote-worker-relocator', 'budget-focused']
    },
    core_reader_question: 'Does Lima still deliver compelling long-stay value?',
    reader_outcome: 'Know which costs and tradeoffs decide the answer.',
    primary_subject: 'Lima',
    scope: {
      mode: 'single_subject',
      references: [
        { name: 'Lima', role: 'primary_subject' },
        { name: 'Medellín', role: 'context_only' }
      ]
    },
    requirements: [
      { requirement_id: 'r1', question: 'What do current housing costs show?' }
    ],
    exclusions: ['Do not organize the article by city.'],
    rationale: 'Keeps Lima central while allowing limited regional context.'
  }
}

const directions: Prompt2BlogDirectionOption[] = [
  makeDirection(
    'direction-1',
    'analysis',
    'Test whether Lima still earns its bargain reputation.'
  ),
  makeDirection(
    'direction-2',
    'comparison',
    'Compare relocation costs across three cities.'
  ),
  makeDirection(
    'direction-3',
    'explainer',
    'Explain which expenses changed most.'
  )
]

const commissionDraft: Prompt2BlogCommissionDraft = {
  schema_version: 3,
  original_title: "Is Lima still South America's bargain expat capital?",
  location: 'Lima, Peru',
  approved_direction: directions[0].direction,
  form_id: 'analysis',
  topic_module_ids: [
    'cost-affordability',
    'accommodation-neighborhoods',
    'food-drink',
    'long-stay-remote-work'
  ],
  audience: directions[0].audience,
  core_reader_question: directions[0].core_reader_question,
  reader_outcome: directions[0].reader_outcome,
  primary_subject: 'Lima',
  scope: directions[0].scope,
  requirements: directions[0].requirements,
  exclusions: directions[0].exclusions,
  call_to_action: null
}

describe('DirectionCards', () => {
  it('renders exactly three native radio choices with decision context', () => {
    render(
      <DirectionCards
        editorialOptions={editorialOptions}
        options={directions}
        selectedOptionId={null}
        onSelect={vi.fn()}
      />
    )

    const picker = screen.getByRole('group', {
      name: 'Choose one editorial direction'
    })
    expect(within(picker).getAllByRole('radio')).toHaveLength(3)
    expect(
      within(picker).getByRole('radio', {
        name: /Direction 1 Analysis Test whether Lima/
      })
    ).toBeInTheDocument()
    expect(within(picker).getByText('Analysis')).toBeInTheDocument()
    expect(within(picker).getAllByText('Cost')).toHaveLength(3)
    expect(within(picker).getAllByText(/Remote workers deciding/)).toHaveLength(
      3
    )
    expect(within(picker).getAllByText(/Does Lima still deliver/)).toHaveLength(
      3
    )
    expect(within(picker).getAllByText(/Know which costs/)).toHaveLength(3)
    expect(
      within(picker).getAllByText(/Single subject: Lima \(Primary subject\)/)
    ).toHaveLength(3)
    expect(within(picker).getAllByText(/Keeps Lima central/)).toHaveLength(3)
  })

  it('reports selected option through native radio interaction', () => {
    const onSelect = vi.fn()
    render(
      <DirectionCards
        editorialOptions={editorialOptions}
        options={directions}
        selectedOptionId="direction-1"
        onSelect={onSelect}
      />
    )

    const radios = screen.getAllByRole('radio')
    expect(radios[0]).toBeChecked()
    fireEvent.click(radios[1])
    expect(onSelect).toHaveBeenCalledWith(directions[1])
  })

  it('blocks malformed option counts at runtime', () => {
    render(
      <DirectionCards
        editorialOptions={editorialOptions}
        options={directions.slice(0, 2)}
        selectedOptionId={null}
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('exactly three options')
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })
})

function CommissionHarness({
  onApprove = vi.fn()
}: {
  onApprove?: () => void
}) {
  const [draft, setDraft] = useState(commissionDraft)
  return (
    <CommissionEditor
      draft={draft}
      editorialOptions={editorialOptions}
      isApproved={false}
      onApprove={onApprove}
      onChange={setDraft}
    />
  )
}

describe('CommissionEditor', () => {
  it('exposes every commission control and enforces the four-module limit', () => {
    render(<CommissionHarness />)

    expect(screen.getByLabelText('Original title')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Location')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Approved direction')).toBeInTheDocument()
    expect(screen.getByLabelText('Article form')).toHaveValue('analysis')
    expect(screen.getByLabelText('Primary audience')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Relocator/ })).toBeChecked()
    expect(screen.getByLabelText('Core reader question')).toBeInTheDocument()
    expect(screen.getByLabelText('Reader outcome')).toBeInTheDocument()
    expect(screen.getByLabelText('Primary subject')).toHaveValue('Lima')
    expect(screen.getByLabelText('Scope mode')).toHaveValue('single_subject')
    expect(screen.getByLabelText('Reference 1')).toHaveValue('Medellín')
    expect(screen.getByLabelText('Reference 1 role')).toHaveValue(
      'context_only'
    )
    expect(screen.getByLabelText('Requirement 1 ID')).toHaveValue('r1')
    expect(screen.getByLabelText('Requirement 1 question')).toBeInTheDocument()
    expect(
      screen.getByLabelText('Exclusions (one per line)')
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText('Call to action (optional)')
    ).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Safety/ })).toBeDisabled()
  })

  it('keeps primary reference visibly synced to primary subject', () => {
    render(<CommissionHarness />)

    fireEvent.change(screen.getByLabelText('Primary subject'), {
      target: { value: 'Greater Lima' }
    })

    expect(screen.getByLabelText('Primary reference')).toHaveValue(
      'Greater Lima'
    )
  })

  it('surfaces invalid scope without silently changing reference roles', () => {
    const onApprove = vi.fn()
    render(<CommissionHarness onApprove={onApprove} />)

    fireEvent.change(screen.getByLabelText('Scope mode'), {
      target: { value: 'head_to_head' }
    })

    expect(screen.getByLabelText('Reference 1 role')).toHaveValue(
      'context_only'
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Head-to-head scope needs at least one comparator.'
    )
    expect(
      screen.getByRole('button', { name: 'Approve commission' })
    ).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Reference 1 role'), {
      target: { value: 'comparator' }
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve commission' }))
    expect(onApprove).toHaveBeenCalledOnce()
  })
})
