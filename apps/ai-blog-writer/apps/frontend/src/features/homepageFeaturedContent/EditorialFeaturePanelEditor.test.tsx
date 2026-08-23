import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { EditorialFeatureBlockResponse } from './pageBlocks'
import EditorialFeaturePanelEditor from './EditorialFeaturePanelEditor'

vi.mock('./locationHomepages', () => ({
  fetchLocationHomepagesList: async () => []
}))

vi.mock('../../shared/images/picker', () => ({
  ImagePicker: ({
    isOpen,
    onSelect
  }: {
    isOpen: boolean
    onSelect: (result: {
      kind: 'mediaSets'
      mediaSets: Array<{ id: number }>
    }) => void
  }) =>
    isOpen ? (
      <button
        type="button"
        onClick={() => onSelect({ kind: 'mediaSets', mediaSets: [{ id: 42 }] })}
      >
        Select test image
      </button>
    ) : null
}))

const block: EditorialFeatureBlockResponse = {
  id: 'editorial-1',
  blockType: 'editorial-feature',
  selection: {
    totalSlots: 2,
    items: [],
    invalidItems: [],
    isComplete: false,
    allowDrafts: true
  },
  featureKicker: 'Featured destination',
  featureTitle: 'Saved title',
  featureDescription: 'Saved description',
  featureMediaSetId: null,
  featureImagePortrait: null,
  featureImageWide: null,
  featureImageAltReady: false,
  linkedLocationId: null,
  linkedLocation: null,
  linkWarning: null
}

function Harness() {
  const [currentBlock, setCurrentBlock] = useState(block)

  return (
    <EditorialFeaturePanelEditor
      block={currentBlock}
      canManage
      saveFields={async (fields) => {
        if ('featureMediaSet' in fields) {
          setCurrentBlock((current) => ({
            ...current,
            featureMediaSetId: fields.featureMediaSet ?? null
          }))
        }
      }}
    />
  )
}

describe('EditorialFeaturePanelEditor', () => {
  it('preserves unsaved copy when selecting an image rerenders the block', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    })

    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>
    )

    const title = screen.getByRole('textbox', { name: /Feature title/ })
    const description = screen.getByRole('textbox', { name: /Description/ })
    await user.clear(title)
    await user.type(title, 'Unsaved title')
    await user.clear(description)
    await user.type(description, 'Unsaved description')
    await user.click(screen.getByRole('button', { name: 'Choose image' }))
    await user.click(screen.getByRole('button', { name: 'Select test image' }))

    expect(title).toHaveValue('Unsaved title')
    expect(description).toHaveValue('Unsaved description')
  })

  it('keeps saved feature panel settings closed until an editor opens them', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    })

    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>
    )

    const summary = screen.getByText('Feature panel settings')
    const disclosure = summary.closest('details')
    expect(disclosure).not.toHaveAttribute('open')

    await user.click(summary)

    expect(disclosure).toHaveAttribute('open')
  })

  it('opens a blank feature panel for setup and closes it after save', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    })
    const blankBlock: EditorialFeatureBlockResponse = {
      ...block,
      featureKicker: null,
      featureTitle: null,
      featureDescription: null
    }
    const saveFields = vi.fn(async () => {})

    render(
      <QueryClientProvider client={queryClient}>
        <EditorialFeaturePanelEditor
          block={blankBlock}
          canManage
          saveFields={saveFields}
        />
      </QueryClientProvider>
    )

    const disclosure = screen
      .getByText('Feature panel settings')
      .closest('details')
    expect(disclosure).toHaveAttribute('open')

    await user.type(
      screen.getByRole('textbox', { name: /Feature title/ }),
      'New feature'
    )
    await user.click(screen.getByRole('button', { name: 'Save feature panel' }))

    await waitFor(() => expect(disclosure).not.toHaveAttribute('open'))
    expect(saveFields).toHaveBeenCalledWith(
      expect.objectContaining({ featureTitle: 'New feature' }),
      expect.anything()
    )
  })
})
