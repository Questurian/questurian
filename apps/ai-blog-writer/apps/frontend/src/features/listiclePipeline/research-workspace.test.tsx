import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { ResearchViewer } from './components/ResearchViewer'
import {
  applyResearchImport,
  loadProfileResearch,
  openResearchWorkspace,
  previewResearchImport,
  saveEntryBlurb,
  saveResearchWorkspace
} from './api'
import type { EntryResearchWorkspace, ResearchImportPreview } from './types'

vi.mock('./api', () => ({
  applyResearchImport: vi.fn(),
  openResearchWorkspace: vi.fn(),
  loadProfileResearch: vi.fn(),
  previewResearchImport: vi.fn(),
  saveEntryBlurb: vi.fn(),
  saveResearchWorkspace: vi.fn()
}))
const initial: EntryResearchWorkspace = {
  profile_id: 'p1',
  version: 0,
  context_key: 'ctx',
  order_revision: 1,
  slots: {
    why_it_belongs: null,
    what_to_order_or_notice: [],
    visit_character: null,
    useful_detail: null,
    story_depth: null,
    caveat: null
  },
  supporting_findings: {},
  ready: false,
  stale: false,
  prompt: 'Exact branch, subject and source leads.'
}
const preview: ResearchImportPreview = {
  version: 0,
  context_key: 'ctx',
  can_apply: true,
  warnings: ['Unchecked research'],
  changes: [
    { field: 'why_it_belongs', before: null, after: 'Distinctive sauces.' },
    {
      field: 'what_to_order_or_notice',
      before: [],
      after: ['Ají amarillo wings']
    },
    { field: 'story_depth', before: null, after: 'Opened in 2020.' }
  ],
  packet: {
    identity_match: { status: 'matched', note: 'Address matched.' },
    fit: { status: 'usable', why: 'Specific sauce', source_urls: [] },
    facts: [
      {
        id: 'f1',
        text: 'Ají amarillo wings.',
        category: 'signature',
        why_useful: '',
        scope: 'branch',
        temporal_type: 'current',
        observed_or_published_at: null,
        source: {
          url: 'https://example.com/menu',
          publisher: 'Menu',
          title: ''
        }
      }
    ],
    editorial_take: {
      ...initial.slots,
      why_it_belongs: 'Distinctive sauces.',
      what_to_order_or_notice: ['Ají amarillo wings'],
      story_depth: 'Opened in 2020.'
    },
    stale_or_rejected_claims: [],
    open_questions: []
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(openResearchWorkspace).mockResolvedValue(initial)
  // The test uses the same public research response shape as the real tab.
  vi.mocked(loadProfileResearch).mockResolvedValue({
    profile_id: 'p1',
    name: 'Example',
    city: 'Lima',
    district: 'Miraflores',
    place_id: 'google-1',
    topics: ['wings'],
    topic: 'wings',
    findings: [],
    sources: [],
    possible_angles: [],
    history: [],
    coverage: [],
    open_questions: [],
    runs: []
  })
})

it('defaults to workspace, previews without applying, preserves deselected slots and permits editing afterward', async () => {
  vi.mocked(previewResearchImport).mockResolvedValue(preview)
  const imported = {
    ...initial,
    version: 1,
    ready: true,
    slots: {
      ...initial.slots,
      why_it_belongs: 'Distinctive sauces.',
      what_to_order_or_notice: ['Ají amarillo wings']
    }
  }
  vi.mocked(applyResearchImport).mockResolvedValue(imported)
  vi.mocked(saveResearchWorkspace).mockResolvedValue({
    ...imported,
    version: 2,
    slots: { ...imported.slots, why_it_belongs: 'Operator wording.' }
  })
  render(
    <ResearchViewer
      runId="run"
      candidateId="c1"
      profileId="p1"
      topic="wings"
      topicLabel="Wings"
      placeName="Example"
      canResearch={false}
      researching={false}
      onClose={() => {}}
    />
  )
  expect(
    screen.getByRole('tab', { name: 'Research workspace' })
  ).toHaveAttribute('aria-selected', 'true')
  await screen.findByLabelText('Why it belongs')
  await userEvent.type(screen.getByLabelText('Paste research JSON'), 'packet')
  await userEvent.click(screen.getByRole('button', { name: 'Preview import' }))
  await screen.findByRole('region', { name: 'Import preview' })
  expect(applyResearchImport).not.toHaveBeenCalled()
  await userEvent.click(
    screen.getByRole('checkbox', { name: /People, history, or recognition/ })
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Apply selected research' })
  )
  await waitFor(() =>
    expect(applyResearchImport).toHaveBeenCalledWith(
      'run',
      'c1',
      expect.objectContaining({
        fields: ['why_it_belongs', 'what_to_order_or_notice'],
        fact_ids: ['f1']
      })
    )
  )
  expect(screen.getByLabelText('People, history, or recognition')).toHaveValue(
    ''
  )
  await userEvent.clear(screen.getByLabelText('Why it belongs'))
  await userEvent.type(
    screen.getByLabelText('Why it belongs'),
    'Operator wording.'
  )
  await userEvent.click(screen.getByRole('button', { name: 'Save brief' }))
  await waitFor(() =>
    expect(saveResearchWorkspace).toHaveBeenCalledWith(
      'run',
      'c1',
      expect.objectContaining({
        version: 1,
        slots: { why_it_belongs: 'Operator wording.' }
      })
    )
  )
  await userEvent.click(
    screen.getByRole('tab', { name: 'Automated research (existing)' })
  )
  expect(screen.getByRole('button', { name: 'All topics' })).toBeVisible()
  await userEvent.click(screen.getByRole('tab', { name: 'Research workspace' }))
  expect(screen.getByLabelText('Why it belongs')).toHaveValue(
    'Operator wording.'
  )
})

it('copies one place prompt and saves the blurb pasted back', async () => {
  const blurb = { version: 0, text: '', prompt: 'Titled "The Best Wings". Brief.', stale: false }
  const ready = {
    ...initial,
    version: 1,
    ready: true,
    slots: {
      ...initial.slots,
      why_it_belongs: 'Red Ale marinade.',
      what_to_order_or_notice: ['BBQ IPA wings']
    },
    blurb
  }
  vi.mocked(openResearchWorkspace).mockResolvedValue(ready)
  vi.mocked(saveEntryBlurb).mockResolvedValue({
    ...ready,
    blurb: { ...blurb, version: 1, text: 'Pasted blurb.' }
  })
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  render(
    <ResearchViewer
      runId="run"
      candidateId="c1"
      profileId="p1"
      topic="wings"
      topicLabel="Wings"
      placeName="Example"
      canResearch={false}
      researching={false}
      onClose={() => {}}
    />
  )
  await userEvent.click(await screen.findByRole('button', { name: 'Copy blurb prompt' }))
  expect(writeText).toHaveBeenCalledWith('Titled "The Best Wings". Brief.')
  await userEvent.type(screen.getByLabelText('Blurb text'), 'Pasted blurb.')
  await userEvent.click(screen.getByRole('button', { name: 'Save blurb' }))
  await waitFor(() =>
    expect(saveEntryBlurb).toHaveBeenCalledWith('run', 'c1', {
      version: 0,
      text: 'Pasted blurb.'
    })
  )
  expect(await screen.findByText('Saved')).toBeInTheDocument()
})

it('does not offer the blurb prompt until the two core details are filled', async () => {
  vi.mocked(openResearchWorkspace).mockResolvedValue({
    ...initial,
    blurb: { version: 0, text: '', prompt: 'x', stale: false }
  })
  render(
    <ResearchViewer
      runId="run"
      candidateId="c1"
      profileId="p1"
      topic="wings"
      topicLabel="Wings"
      placeName="Example"
      canResearch={false}
      researching={false}
      onClose={() => {}}
    />
  )
  expect(await screen.findByRole('button', { name: 'Copy blurb prompt' })).toBeDisabled()
})
