// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PROMPT_PRESET_ID,
  IMAGE_RECREATION_PROMPTS_STORAGE_KEY
} from './config'

vi.mock('./ReferenceImageCropModal', () => ({
  ReferenceImageCropModal: ({
    initialPresetId,
    isOpen,
    onClose,
    onConfirm,
    onUseOriginal,
    sourceFile
  }: {
    initialPresetId?: string
    isOpen: boolean
    onClose: () => void
    onConfirm: (input: { presetId: string; file: File; crop: null }) => void
    onUseOriginal: () => void
    sourceFile?: File | null
  }) => {
    if (!isOpen) return null

    return (
      <div role="dialog" aria-label="Reference image crop editor">
        <p>Reference crop modal</p>
        <p>Initial preset {initialPresetId}</p>
        <p>Source file {sourceFile?.name}</p>
        <button type="button" onClick={onUseOriginal}>
          Use original
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() =>
            onConfirm({
              presetId: 'open_graph',
              label: 'Open Graph crop',
              width: 1200,
              height: 630,
              file: new File(['cropped'], 'staged-open-graph.webp', {
                type: 'image/webp'
              })
            })
          }
        >
          Save open graph crop
        </button>
      </div>
    )
  }
}))

import ImageRecreationPromptsPage from './ImageRecreationPromptsPage'

const mockAuthState = vi.hoisted(() => ({
  token: 'test-token' as string | null,
  expiresAt: null as number | null,
  user: null,
  isAuthenticated: true,
  isRestoringSession: false,
  isConnected: true,
  connectionError: null as string | null,
  login: vi.fn(),
  logout: vi.fn()
}))

vi.mock('../auth', () => ({
  useAuth: () => mockAuthState
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <ImageRecreationPromptsPage />
    </MemoryRouter>
  )
}

function uploadPrimaryReference(fileName = 'travel-photo.jpg') {
  fireEvent.change(screen.getByLabelText('Upload reference image'), {
    target: {
      files: [new File(['preview'], fileName, { type: 'image/jpeg' })]
    }
  })
}

describe('ImageRecreationPromptsPage', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    localStorage.clear()
    mockAuthState.token = 'test-token'
    vi.stubGlobal('fetch', vi.fn())
    vi.stubGlobal('open', vi.fn())

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(
        (input: Blob) =>
          `blob:${input instanceof File ? input.name : 'generated-result'}`
      )
    })

    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn()
    })
  })

  it('shows the simplified core form by default and hides advanced controls', () => {
    renderPage()

    expect(screen.getByLabelText('Preset')).toHaveValue(
      DEFAULT_PROMPT_PRESET_ID
    )
    expect(screen.getByLabelText('Scene category')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'No, none visible' })
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('People strategy')).toHaveValue('remove')
    expect(screen.getByLabelText('People override')).toBeInTheDocument()
    expect(screen.getByLabelText('Creative direction')).toBeInTheDocument()
    expect(screen.getByLabelText('FLUX model')).toHaveValue(
      'flux-2-pro-preview'
    )
    expect(
      screen.getByRole('button', { name: /show advanced/i })
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Safety tolerance')).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText('People / crowd vibe')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /browse scene category cards/i })
    ).not.toBeInTheDocument()
  })

  it('reveals advanced camera and FLUX controls when expanded', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /show advanced/i }))

    expect(screen.getByLabelText('Camera preset')).toBeInTheDocument()
    expect(screen.getByLabelText('Lens preset')).toBeInTheDocument()
    expect(
      within(screen.getByLabelText('Lighting / time of day')).getByRole(
        'option',
        { name: 'Sun through thin cloud' }
      )
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Safety tolerance')).toHaveValue('2')
    expect(screen.getByLabelText('Seed')).toHaveValue('')
    expect(screen.getByLabelText(/Enable prompt upsampling/i)).not.toBeChecked()
  })

  it('keeps people strategy available for people-free references and shows a warning on divergence', async () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('People strategy'), {
      target: { value: 'recast-or-add' }
    })
    fireEvent.change(screen.getByLabelText('People override'), {
      target: {
        value: 'Add one stylish traveler near the foreground.'
      }
    })
    fireEvent.change(screen.getByLabelText('Creative direction'), {
      target: {
        value: 'Keep the landmark dominant and the travel look clean.'
      }
    })

    expect(screen.getByText('People strategy override')).toBeInTheDocument()
    expect(
      screen.getByText(
        'The reference is marked people-free, so this strategy departs from the source photo and relies on your people override or creative direction.'
      )
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(
        (screen.getByLabelText('Final prompt preview') as HTMLTextAreaElement)
          .value
      ).toContain(
        'People override: Add one stylish traveler near the foreground.'
      )
    })

    expect(
      (screen.getByLabelText('Final prompt preview') as HTMLTextAreaElement)
        .value
    ).toContain(
      'Apply this creative direction while respecting the reference scene and preservation rules: Keep the landmark dominant and the travel look clean.'
    )
  })

  it('migrates legacy saved state from v1 into the new core schema', () => {
    localStorage.setItem(
      'image_recreation_prompts_form_v1',
      JSON.stringify({
        presetId: 'custom',
        sceneCategory: 'tourist-landmark-crowd',
        referenceHasPeople: true,
        peopleHandling: 'remove-all-people',
        customPeopleHandling: 'Keep one couple by the fountain.',
        extraInstructions: 'Keep the landmark dominant.',
        modelId: 'flux-2-max'
      })
    )

    renderPage()

    expect(screen.getByLabelText('Scene category')).toHaveValue(
      'tourist-landmark'
    )
    expect(screen.getByLabelText('People strategy')).toHaveValue('remove')
    expect(screen.getByLabelText('People override')).toHaveValue(
      'Keep one couple by the fountain.'
    )
    expect(screen.getByLabelText('Creative direction')).toHaveValue(
      'Keep the landmark dominant.'
    )
    expect(screen.getByLabelText('FLUX model')).toHaveValue('flux-2-max')

    const savedState = JSON.parse(
      localStorage.getItem(IMAGE_RECREATION_PROMPTS_STORAGE_KEY) ?? '{}'
    )

    expect(savedState.sceneCategory).toBe('tourist-landmark')
    expect(savedState.peopleStrategy).toBe('remove')
    expect(savedState.peopleOverrideText).toBe(
      'Keep one couple by the fountain.'
    )
  })

  it('still opens the reference crop modal when a primary image is uploaded', async () => {
    renderPage()
    uploadPrimaryReference()

    const dialog = await screen.findByRole('dialog', {
      name: 'Reference image crop editor'
    })

    expect(within(dialog).getByText('Reference crop modal')).toBeInTheDocument()

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Use original' })
    )

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Reference image crop editor' })
      ).not.toBeInTheDocument()
    })
  })
})
