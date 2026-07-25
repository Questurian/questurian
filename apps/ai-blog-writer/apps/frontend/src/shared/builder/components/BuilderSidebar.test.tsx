import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { BuilderSidebar } from './BuilderSidebar'

function renderSidebar(overrides: Partial<ComponentProps<typeof BuilderSidebar>> = {}) {
  const props: ComponentProps<typeof BuilderSidebar> = {
    draft: {
      payloadId: 15,
      payloadStatus: 'published',
      payloadSlug: 'published-itinerary',
      status: 'published',
      step1_complete: true,
      in_update_mode: false,
      step2_complete: true,
      step2_in_update_mode: false,
      step3_complete: true,
      step3_in_update_mode: false,
    },
    completionPercent: 100,
    isSetupReady: true,
    stepIssues: [],
    seoCoreComplete: true,
    stepThreeSyncIssueLabel: 'Stops have unsaved changes.',
    showPublishedBadge: true,
    editorModelName: 'claude-opus-4-8',
    onEditorModelChange: vi.fn(),
    isSaving: false,
    renderAutoWriteButton: () => <button type="button">Auto write</button>,
    onSaveLocalDraft: vi.fn(),
    onSyncToPayload: vi.fn(),
    ...overrides,
  }

  render(<BuilderSidebar {...props} />)
  return props
}

describe('BuilderSidebar', () => {
  it('shows optional Payload revert action for synced drafts', () => {
    const onRevertToPayload = vi.fn(async () => {})
    renderSidebar({
      revertToPayloadLabel: 'Revert to Last Published',
      onRevertToPayload,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Revert to Last Published' }))

    expect(onRevertToPayload).toHaveBeenCalledTimes(1)
  })

  it('hides Payload revert action when handler is absent', () => {
    renderSidebar()

    expect(screen.queryByRole('button', { name: /Revert to/i })).toBeNull()
  })

  it('does not gate sync status on Step 2 when Step 2 is optional', () => {
    renderSidebar({
      draft: {
        payloadId: 15,
        payloadStatus: 'draft',
        payloadSlug: 'draft-listicle',
        status: 'draft',
        step1_complete: true,
        in_update_mode: false,
        step2_complete: false,
        step2_in_update_mode: false,
        step3_complete: true,
        step3_in_update_mode: false,
      },
      requiresStep2Lock: false,
    })

    expect(screen.getByText('All fields complete.')).toBeInTheDocument()
    expect(screen.queryByText('Header/image has unsaved changes.')).toBeNull()
  })
})
