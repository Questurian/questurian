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
    editorModelName: 'gemini-2.5-flash',
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
})
