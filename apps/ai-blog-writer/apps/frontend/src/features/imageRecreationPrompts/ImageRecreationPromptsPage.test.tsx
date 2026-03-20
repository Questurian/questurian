import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LandingPage from '../../LandingPage'
import {
  DEFAULT_PROMPT_PRESET_ID,
  IMAGE_RECREATION_PROMPTS_STORAGE_KEY,
} from './config'

vi.mock('./ReferenceImageCropModal', () => ({
  ReferenceImageCropModal: ({
    initialPresetId,
    isOpen,
    onClose,
    onConfirm,
    onUseOriginal,
    sourceFile,
  }: any) => {
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
                type: 'image/webp',
              }),
            })
          }
        >
          Save open graph crop
        </button>
      </div>
    )
  },
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
  logout: vi.fn(),
}))

vi.mock('../../providers/useAuth', () => ({
  useAuth: () => mockAuthState,
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <ImageRecreationPromptsPage />
    </MemoryRouter>,
  )
}

async function uploadPrimaryReference(fileName = 'travel-photo.jpg') {
  fireEvent.change(screen.getByLabelText('Upload reference image'), {
    target: {
      files: [new File(['preview'], fileName, { type: 'image/jpeg' })],
    },
  })

  return screen.findByRole('dialog', { name: 'Reference image crop editor' })
}

function useOriginalReferenceFromCropper() {
  const cropper = screen.getByRole('dialog', { name: 'Reference image crop editor' })
  fireEvent.click(within(cropper).getByRole('button', { name: 'Use original' }))
}

function saveOpenGraphCropFromCropper() {
  const cropper = screen.getByRole('dialog', { name: 'Reference image crop editor' })
  fireEvent.click(
    within(cropper).getByRole('button', { name: 'Save open graph crop' }),
  )
}

describe('ImageRecreationPromptsPage', () => {
  beforeEach(() => {
    localStorage.clear()
    mockAuthState.token = 'test-token'
    vi.stubGlobal('fetch', vi.fn())
    vi.stubGlobal('open', vi.fn())

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((input: Blob) => `blob:${input instanceof File ? input.name : 'generated-result'}`),
    })

    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
  })

  it('shows a useful default prompt on first load', () => {
    renderPage()

    expect(screen.getByLabelText('Preset')).toHaveValue(DEFAULT_PROMPT_PRESET_ID)
    expect(screen.getByLabelText('FLUX model')).toHaveValue('flux-2-pro-preview')
    expect(screen.getByLabelText('Safety tolerance')).toHaveValue('2')
    expect(screen.getByLabelText('Seed')).toHaveValue('')
    expect(screen.queryByLabelText('Output size')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Primary reference sizing')).toHaveTextContent(
      'Original reference',
    )
    expect(screen.getByLabelText('People / crowd vibe')).toHaveValue('match-reference-crowd')
    expect(screen.getByLabelText('Shot perspective')).toHaveValue('match-reference-viewpoint')
    expect(screen.getByLabelText('Filter / color look')).toHaveValue('neutral-no-filter')
    expect(screen.getByRole('button', { name: 'No, none visible' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByLabelText('People amount / crowd level')).toBeDisabled()
    expect(screen.getByLabelText('People handling')).toBeDisabled()
    expect(screen.getByLabelText('People / crowd vibe')).toBeDisabled()
    expect((screen.getByLabelText('Final prompt preview') as HTMLTextAreaElement).value).toContain(
      'Use the uploaded reference image as the exact subject, composition base, and scene category.',
    )
    expect(
      screen.getByText(
        'Start by locking the kind of scene this actually is: landscape, landmark, city, portrait, architecture, mural, market, cafe, nightlife, and so on.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Clean landmark image where the structure stays dominant and the scene remains empty.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('People controls are locked')).toBeInTheDocument()
  })

  it('updates the form and preview when a preset is selected', async () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('Preset'), {
      target: { value: 'desert-landscape-editorial' },
    })

    await waitFor(() => {
      expect(screen.getByLabelText('Scene category')).toHaveValue('desert-rock-formations')
    })

    expect(screen.getByLabelText('Lighting / time of day')).toHaveValue('golden-hour')
    expect(screen.getByLabelText('People handling')).toBeDisabled()
    expect((screen.getByLabelText('Final prompt preview') as HTMLTextAreaElement).value).toContain(
      'Recreate it as a true-to-life editorial photograph captured with Sony A7R V and 35mm f/1.8.',
    )
    expect(
      screen.getByText('Arid landscape with geological form, texture, and open light.'),
    ).toBeInTheDocument()
  })

  it('includes expanded travel scene categories like street art and market scenes', () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('Scene category'), {
      target: { value: 'street-art-mural' },
    })

    expect(screen.getByLabelText('Scene category')).toHaveValue('street-art-mural')
    expect(
      screen.getByText(
        'Street-art scene built around a mural, painted wall, or graphic public artwork.',
      ),
    ).toBeInTheDocument()
  })

  it('shows the selected option description under each dropdown', async () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Yes, people are visible' }))
    fireEvent.change(screen.getByLabelText('People / crowd vibe'), {
      target: { value: 'locals-dominant' },
    })

    expect(
      screen.getByText('People should feel more like everyday locals than destination tourists.'),
    ).toBeInTheDocument()
  })

  it('shows grouped filter descriptions', () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('Filter / color look'), {
      target: { value: 'kodachrome-64' },
    })

    expect(
      screen.getByText(
        'Classic slide-film nostalgia with saturated travel color and old-magazine warmth.',
      ),
    ).toBeInTheDocument()
  })

  it('shows the new subtle modern-vintage filter descriptions', () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('Filter / color look'), {
      target: { value: 'modern-vintage-soft-warm' },
    })

    expect(
      screen.getByText(
        'Modern editorial warmth with intact contrast and only a hint of analog softness.',
      ),
    ).toBeInTheDocument()
  })

  it('shows the subtle analog grain description for cleaner classic texture', () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('Filter / color look'), {
      target: { value: 'subtle-analog-grain' },
    })

    expect(
      screen.getByText(
        'Mostly modern color and contrast with ultra-fine film grain instead of dusty vintage specks.',
      ),
    ).toBeInTheDocument()
  })

  it('adds centered composition guidance when the checkbox is enabled', () => {
    renderPage()

    fireEvent.click(screen.getByRole('checkbox', { name: /Center and balance the composition/i }))

    expect(
      (screen.getByLabelText('Final prompt preview') as HTMLTextAreaElement).value,
    ).toContain(
      'Center the main subject in the composition and create a more symmetrical, balanced image. Align the subject along the vertical center axis, correct any tilt or perspective distortion, and evenly distribute visual weight on both sides of the frame. Straighten lines where needed, improve framing so the scene feels intentional and harmonious, and keep the result realistic and natural to the original image.',
    )
  })

  it('handles reference-image upload, replacement, and removal locally', async () => {
    renderPage()

    const input = screen.getByLabelText('Upload reference image')
    const firstFile = new File(['first'], 'desert-reference.jpg', { type: 'image/jpeg' })
    const secondFile = new File(['second'], 'landmark-reference.png', { type: 'image/png' })

    fireEvent.change(input, {
      target: { files: [firstFile] },
    })

    expect(await screen.findByRole('dialog', { name: 'Reference image crop editor' })).toBeInTheDocument()
    useOriginalReferenceFromCropper()
    expect(await screen.findByRole('button', { name: 'Replace image' })).toBeInTheDocument()
    expect(screen.getByAltText('Selected reference preview')).toHaveAttribute(
      'src',
      'blob:desert-reference.jpg',
    )

    fireEvent.change(input, {
      target: { files: [secondFile] },
    })

    expect(await screen.findByRole('dialog', { name: 'Reference image crop editor' })).toBeInTheDocument()
    useOriginalReferenceFromCropper()

    await waitFor(() => {
      expect(screen.getByAltText('Selected reference preview')).toHaveAttribute(
        'src',
        'blob:landmark-reference.png',
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }))

    await waitFor(() => {
      expect(screen.queryByAltText('Selected reference preview')).not.toBeInTheDocument()
    })
  })

  it('auto-opens the crop modal for a newly uploaded primary reference', async () => {
    renderPage()

    const cropper = await uploadPrimaryReference()

    expect(cropper).toHaveTextContent('Reference crop modal')
    expect(cropper).toHaveTextContent('Initial preset original')
  })

  it('reopens the crop modal with the current staged preset', async () => {
    renderPage()

    await uploadPrimaryReference()
    saveOpenGraphCropFromCropper()

    expect(await screen.findByText('Open Graph crop is staged')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit crop' }))

    expect(await screen.findByRole('dialog', { name: 'Reference image crop editor' })).toHaveTextContent(
      'Initial preset open_graph',
    )
  })

  it('requires a reference image before enabling FLUX generation', async () => {
    renderPage()

    expect(
      screen.getByRole('button', { name: /Upload a reference image to unlock FLUX.2/i }),
    ).toBeDisabled()
    expect(
      screen.getByText('FLUX.2 generation stays locked until exactly one reference image is uploaded.'),
    ).toBeInTheDocument()

    await uploadPrimaryReference()
    useOriginalReferenceFromCropper()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Generate with FLUX.2/i })).not.toBeDisabled()
    })
    expect(
      screen.queryByText('FLUX.2 generation stays locked until exactly one reference image is uploaded.'),
    ).not.toBeInTheDocument()
  })

  it('keeps FLUX generation disabled when the auth token is unavailable', async () => {
    mockAuthState.token = null

    renderPage()

    await uploadPrimaryReference()
    useOriginalReferenceFromCropper()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Generate with FLUX.2/i })).toBeDisabled()
    })
  })

  it('adds and removes supporting reference images locally', async () => {
    renderPage()

    const supportingInput = screen.getByLabelText('Add supporting reference images')
    const firstSupportingFile = new File(['texture'], 'texture-reference.png', { type: 'image/png' })
    const secondSupportingFile = new File(['chair'], 'chair-reference.jpg', { type: 'image/jpeg' })

    fireEvent.change(supportingInput, {
      target: { files: [firstSupportingFile, secondSupportingFile] },
    })

    expect(await screen.findByAltText('Supporting reference 1')).toHaveAttribute(
      'src',
      'blob:texture-reference.png',
    )
    expect(screen.getByAltText('Supporting reference 2')).toHaveAttribute(
      'src',
      'blob:chair-reference.jpg',
    )
    expect(screen.getByText('2 / 7 supporting references')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Remove texture-reference\.png/i }))

    await waitFor(() => {
      expect(screen.queryByAltText('Supporting reference 2')).not.toBeInTheDocument()
    })

    expect(screen.getByAltText('Supporting reference 1')).toHaveAttribute(
      'src',
      'blob:chair-reference.jpg',
    )
    expect(screen.getByText('1 / 7 supporting references')).toBeInTheDocument()
  })

  it('copies the generated prompt to the clipboard', async () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }))

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining(
          'Use the uploaded reference image as the exact subject, composition base, and scene category.',
        ),
      )
    })

    expect(screen.getByText('Prompt copied to clipboard.')).toBeInTheDocument()
  })

  it('generates an image preview with FLUX.2 and marks it stale after prompt changes', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('png-bytes', {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Content-Disposition': 'inline; filename="flux-preview.png"',
          'X-BFL-Request-Id': 'req_123',
          'X-BFL-Model': 'flux-2-pro-preview',
          'X-BFL-Cost': '3.5',
          'X-BFL-Output-MP': '1',
        },
      }),
    )

    renderPage()

    await uploadPrimaryReference()
    saveOpenGraphCropFromCropper()
    fireEvent.change(screen.getByLabelText('FLUX model'), {
      target: { value: 'flux-2-flex' },
    })
    fireEvent.change(screen.getByLabelText('Safety tolerance'), {
      target: { value: '4' },
    })
    fireEvent.change(screen.getByLabelText('Seed'), {
      target: { value: '4242' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /Enable prompt upsampling/i }))
    fireEvent.change(screen.getByLabelText('Add supporting reference images'), {
      target: {
        files: [
          new File(['texture'], 'texture-reference.png', { type: 'image/png' }),
          new File(['chair'], 'chair-reference.jpg', { type: 'image/jpeg' }),
        ],
      },
    })

    fireEvent.click(screen.getByRole('button', { name: /Generate with FLUX.2/i }))

    await screen.findByAltText('Generated FLUX.2 preview')

    expect(fetch).toHaveBeenCalledTimes(1)
    const [, requestInit] = vi.mocked(fetch).mock.calls[0]
    const requestBody = requestInit?.body as FormData

    expect(requestInit?.method).toBe('POST')
    expect(requestInit?.headers).toMatchObject({
      Authorization: 'Bearer test-token',
    })
    expect(requestBody.get('prompt')).toEqual(
      expect.stringContaining(
        'Use the uploaded reference image as the exact subject, composition base, and scene category.',
      ),
    )
    expect(requestBody.get('reference_image')).toBeInstanceOf(File)
    expect(requestBody.get('model_id')).toBe('flux-2-flex')
    expect(requestBody.get('width')).toBe('1200')
    expect(requestBody.get('height')).toBe('630')
    expect(requestBody.get('safety_tolerance')).toBe('4')
    expect(requestBody.get('prompt_upsampling')).toBe('true')
    expect(requestBody.get('seed')).toBe('4242')
    expect(requestBody.getAll('additional_reference_images')).toHaveLength(2)
    expect((requestBody.get('reference_image') as File).name).toBe('staged-open-graph.webp')

    expect(screen.getByAltText('Generated FLUX.2 preview')).toHaveAttribute(
      'src',
      'blob:generated-result',
    )
    expect(screen.getByAltText('Reference image used for FLUX.2 generation')).toHaveAttribute(
      'src',
      'blob:staged-open-graph.webp',
    )
    expect(screen.getByText('flux-2-pro-preview')).toBeInTheDocument()
    expect(screen.getByText('3 references')).toBeInTheDocument()
    expect(screen.getByText('3.5 credits')).toBeInTheDocument()
    expect(screen.getByText('1 MP output')).toBeInTheDocument()
    expect(screen.getByText('Request req_123')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Expand primary reference/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Expand supporting reference 1/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Expand generated image/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open full image/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Download image/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Expand generated image/i }))

    const expandedPreview = await screen.findByRole('dialog', { name: 'Expanded image preview' })
    expect(within(expandedPreview).getByText('Generated image')).toBeInTheDocument()
    expect(within(expandedPreview).getByAltText('Generated FLUX.2 preview')).toHaveAttribute(
      'src',
      'blob:generated-result',
    )

    fireEvent.click(within(expandedPreview).getByRole('button', { name: 'Close' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Expanded image preview' })).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Open full image/i }))

    expect(window.open).toHaveBeenCalledWith(
      'blob:generated-result',
      '_blank',
      'noopener,noreferrer',
    )

    fireEvent.change(screen.getByLabelText('Additional user guidance'), {
      target: { value: 'Keep the sky slightly softer.' },
    })

    expect(screen.getByText('Inputs changed after generation')).toBeInTheDocument()
  })

  it('resets the form and clears the local preview', async () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('Preset'), {
      target: { value: 'couple-travel-photo' },
    })
    fireEvent.change(screen.getByLabelText('Additional user guidance'), {
      target: { value: 'Keep the sky slightly softer.' },
    })
    await uploadPrimaryReference()
    useOriginalReferenceFromCropper()

    expect(await screen.findByAltText('Selected reference preview')).toHaveAttribute(
      'src',
      'blob:travel-photo.jpg',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Preset')).toHaveValue(DEFAULT_PROMPT_PRESET_ID)
    })

    expect(screen.getByLabelText('Additional user guidance')).toHaveValue('')
    expect(screen.queryByAltText('Selected reference preview')).not.toBeInTheDocument()
  })

  it('clears the generated image result on reset', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('png-bytes', {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Content-Disposition': 'inline; filename="flux-preview.png"',
        },
      }),
    )

    renderPage()

    await uploadPrimaryReference()
    useOriginalReferenceFromCropper()
    fireEvent.click(screen.getByRole('button', { name: /Generate with FLUX.2/i }))

    expect(await screen.findByAltText('Generated FLUX.2 preview')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    await waitFor(() => {
      expect(screen.queryByAltText('Generated FLUX.2 preview')).not.toBeInTheDocument()
    })

    expect(screen.queryByAltText('Selected reference preview')).not.toBeInTheDocument()
  })

  it('shows inline FLUX errors without clearing the prompt or reference image', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: {
            message: 'BFL request failed',
            step: 'submit_flux_edit',
            detail: 'Rate limit exceeded',
          },
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    )

    renderPage()

    await uploadPrimaryReference()
    useOriginalReferenceFromCropper()
    fireEvent.click(screen.getByRole('button', { name: /Generate with FLUX.2/i }))

    expect(await screen.findByText(/BFL request failed/i)).toBeInTheDocument()
    expect(screen.getByAltText('Selected reference preview')).toBeInTheDocument()
    expect((screen.getByLabelText('Final prompt preview') as HTMLTextAreaElement).value).toContain(
      'Use the uploaded reference image as the exact subject, composition base, and scene category.',
    )
  })

  it('omits width and height when the original reference stays active', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('png-bytes', {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Content-Disposition': 'inline; filename="flux-preview.png"',
        },
      }),
    )

    renderPage()

    await uploadPrimaryReference()
    useOriginalReferenceFromCropper()
    fireEvent.click(screen.getByRole('button', { name: /Generate with FLUX.2/i }))

    await screen.findByAltText('Generated FLUX.2 preview')

    const [, requestInit] = vi.mocked(fetch).mock.calls[0]
    const requestBody = requestInit?.body as FormData

    expect(requestBody.get('width')).toBeNull()
    expect(requestBody.get('height')).toBeNull()
    expect((requestBody.get('reference_image') as File).name).toBe('travel-photo.jpg')
  })

  it('shows a non-blocking warning when people presence overrides the scene recommendation', async () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Yes, people are visible' }))
    fireEvent.change(screen.getByLabelText('Scene category'), {
      target: { value: 'portrait' },
    })

    await waitFor(() => {
      expect(screen.getByLabelText('People amount / crowd level')).toHaveValue('one-person')
    })

    fireEvent.change(screen.getByLabelText('People amount / crowd level'), {
      target: { value: 'two-people' },
    })

    expect(screen.getByText(/This scene usually pairs with one person\./i)).toBeInTheDocument()
  })

  it('forces a no-people result when remove-everyone handling is selected', async () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('Preset'), {
      target: { value: 'couple-travel-photo' },
    })

    await waitFor(() => {
      expect(screen.getByLabelText('People amount / crowd level')).toHaveValue('two-people')
    })

    expect(screen.getByLabelText('People amount / crowd level')).not.toBeDisabled()
    expect(screen.getByLabelText('People handling')).not.toBeDisabled()
    expect(screen.getByLabelText('People / crowd vibe')).not.toBeDisabled()

    fireEvent.change(screen.getByLabelText('Primary subject emphasis'), {
      target: { value: 'person-first' },
    })
    fireEvent.change(screen.getByLabelText('Allowed variation'), {
      target: { value: 'small-wardrobe-changes' },
    })

    fireEvent.change(screen.getByLabelText('People handling'), {
      target: { value: 'remove-all-people' },
    })

    await waitFor(() => {
      expect(screen.getByLabelText('People amount / crowd level')).toHaveValue('no-people')
    })

    expect(screen.getByLabelText('People amount / crowd level')).toBeDisabled()
    expect(screen.getByLabelText('People / crowd vibe')).toBeDisabled()
    expect(screen.getByLabelText('Primary subject emphasis')).toHaveValue('environment-first')
    expect(screen.getByLabelText('Allowed variation')).toHaveValue('small-environmental-cleanup')
    expect(
      (screen.getByLabelText('Final prompt preview') as HTMLTextAreaElement).value,
    ).toContain('Remove all people from the frame and keep the scene convincingly people-free.')
  })

  it('restores saved form state from localStorage but not any reference image preview', () => {
    localStorage.setItem(
      IMAGE_RECREATION_PROMPTS_STORAGE_KEY,
      JSON.stringify({
        presetId: 'custom',
        sceneCategory: 'city-street-scene',
        peoplePresence: 'small-group',
        peopleHandling: 'reduce-a-few-people',
        crowdCharacter: 'locals-dominant',
        primarySubjectEmphasis: 'balanced-scene',
        cameraPreset: 'leica-q3',
        lensPreset: '28mm-f2',
        captureStyle: 'street-photography',
        shotPerspective: 'drone-oblique',
        filterLook: 'iphone-vivid',
        lighting: 'blue-hour',
        preservationStrength: 'balanced',
        allowedVariation: 'minor-secondary-detail-changes',
        environmentEnhancement: 'moderate-realism-boost',
        modelId: 'flux-2-flex',
        safetyTolerance: '4',
        enablePromptUpsampling: true,
        seedValue: '999',
        extraInstructions: 'Keep storefront signage believable and understated.',
      }),
    )

    renderPage()

    expect(screen.getByLabelText('Scene category')).toHaveValue('city-street-scene')
    expect(screen.getByLabelText('People handling')).toHaveValue(
      'reduce-a-few-people',
    )
    expect(screen.getByLabelText('People / crowd vibe')).toHaveValue('locals-dominant')
    expect(screen.getByLabelText('Shot perspective')).toHaveValue('drone-oblique')
    expect(screen.getByLabelText('Filter / color look')).toHaveValue('iphone-vivid')
    expect(screen.getByLabelText('FLUX model')).toHaveValue('flux-2-flex')
    expect(screen.getByLabelText('Safety tolerance')).toHaveValue('4')
    expect(screen.getByRole('checkbox', { name: /Enable prompt upsampling/i })).toBeChecked()
    expect(screen.getByLabelText('Seed')).toHaveValue('999')
    expect(screen.getByLabelText('Additional user guidance')).toHaveValue(
      'Keep storefront signage believable and understated.',
    )
    expect(screen.queryByAltText('Selected reference preview')).not.toBeInTheDocument()
  })

  it('migrates legacy people-handling values from localStorage', () => {
    localStorage.setItem(
      IMAGE_RECREATION_PROMPTS_STORAGE_KEY,
      JSON.stringify({
        presetId: 'custom',
        sceneCategory: 'city-street-scene',
        peoplePresence: 'small-group',
        peopleHandling: 'keep-people-secondary',
      }),
    )

    renderPage()

    expect(screen.getByLabelText('People handling')).toHaveValue(
      'people-secondary-environment-primary',
    )
  })

  it('migrates legacy filter ids from localStorage', () => {
    localStorage.setItem(
      IMAGE_RECREATION_PROMPTS_STORAGE_KEY,
      JSON.stringify({
        presetId: 'custom',
        sceneCategory: 'city-street-scene',
        peoplePresence: 'small-group',
        peopleHandling: 'people-secondary-environment-primary',
        crowdCharacter: 'stylish-city-weekend-crowd',
        primarySubjectEmphasis: 'balanced-scene',
        cameraPreset: 'leica-q3',
        lensPreset: '28mm-f2',
        captureStyle: 'street-photography',
        shotPerspective: 'match-reference-viewpoint',
        filterLook: 'kodak-ekta-100',
        lighting: 'blue-hour',
        preservationStrength: 'balanced',
        allowedVariation: 'minor-secondary-detail-changes',
        environmentEnhancement: 'moderate-realism-boost',
        extraInstructions: '',
      }),
    )

    renderPage()

    expect(screen.getByLabelText('Filter / color look')).toHaveValue('kodak-ektar-100')
  })

  it('restores remove-everyone handling as a locked no-people state', () => {
    localStorage.setItem(
      IMAGE_RECREATION_PROMPTS_STORAGE_KEY,
      JSON.stringify({
        presetId: 'custom',
        sceneCategory: 'city-street-scene',
        peoplePresence: 'dense-crowd',
        peopleHandling: 'remove-all-people',
        crowdCharacter: 'stylish-city-weekend-crowd',
        primarySubjectEmphasis: 'balanced-scene',
        cameraPreset: 'leica-q3',
        lensPreset: '28mm-f2',
        captureStyle: 'street-photography',
        shotPerspective: 'match-reference-viewpoint',
        filterLook: 'leica-natural',
        lighting: 'blue-hour',
        preservationStrength: 'balanced',
        allowedVariation: 'small-environmental-cleanup',
        environmentEnhancement: 'moderate-realism-boost',
        extraInstructions: '',
      }),
    )

    renderPage()

    expect(screen.getByLabelText('People handling')).toHaveValue('remove-all-people')
    expect(screen.getByRole('button', { name: 'Yes, people are visible' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByLabelText('People amount / crowd level')).toHaveValue('no-people')
    expect(screen.getByLabelText('People amount / crowd level')).toBeDisabled()
    expect(screen.getByLabelText('People / crowd vibe')).toBeDisabled()
  })

  it('normalizes contradictory no-people state back to people-free controls', () => {
    localStorage.setItem(
      IMAGE_RECREATION_PROMPTS_STORAGE_KEY,
      JSON.stringify({
        presetId: 'custom',
        sceneCategory: 'portrait',
        peoplePresence: 'no-people',
        peopleHandling: 'people-secondary-environment-primary',
        crowdCharacter: 'stylish-city-weekend-crowd',
        primarySubjectEmphasis: 'person-first',
        cameraPreset: 'leica-q3',
        lensPreset: '28mm-f2',
        captureStyle: 'street-photography',
        shotPerspective: 'match-reference-viewpoint',
        filterLook: 'leica-natural',
        lighting: 'blue-hour',
        preservationStrength: 'balanced',
        allowedVariation: 'small-positional-shifts',
        environmentEnhancement: 'moderate-realism-boost',
        extraInstructions: '',
      }),
    )

    renderPage()

    expect(screen.getByLabelText('People handling')).toHaveValue('remove-all-people')
    expect(screen.getByRole('button', { name: 'Yes, people are visible' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByLabelText('People amount / crowd level')).toHaveValue('no-people')
    expect(screen.getByLabelText('Primary subject emphasis')).toHaveValue('environment-first')
    expect(screen.getByLabelText('Allowed variation')).toHaveValue('small-environmental-cleanup')
    expect(screen.getByLabelText('People / crowd vibe')).toBeDisabled()
  })

  it('navigates from the landing page card to the new route', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/image-recreation-prompts" element={<ImageRecreationPromptsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('link', { name: /Image Recreation Prompts/i }))

    expect(await screen.findByRole('heading', { name: /Image recreation prompts/i })).toBeInTheDocument()
  })
})
