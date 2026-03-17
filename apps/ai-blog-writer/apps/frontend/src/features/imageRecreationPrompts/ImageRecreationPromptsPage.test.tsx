import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LandingPage from '../../LandingPage'
import {
  DEFAULT_PROMPT_PRESET_ID,
  IMAGE_RECREATION_PROMPTS_STORAGE_KEY,
} from './config'
import ImageRecreationPromptsPage from './ImageRecreationPromptsPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <ImageRecreationPromptsPage />
    </MemoryRouter>,
  )
}

describe('ImageRecreationPromptsPage', () => {
  beforeEach(() => {
    localStorage.clear()

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((file: File) => `blob:${file.name}`),
    })

    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
  })

  it('shows a useful default prompt on first load', () => {
    renderPage()

    expect(screen.getByLabelText('Preset')).toHaveValue(DEFAULT_PROMPT_PRESET_ID)
    expect(screen.getByLabelText('Aspect ratio')).toHaveValue('match-reference')
    expect(screen.getByLabelText('Filter / color look')).toHaveValue('neutral-no-filter')
    expect((screen.getByLabelText('Final prompt preview') as HTMLTextAreaElement).value).toContain(
      'Use the uploaded reference image as the exact subject, composition base, and scene category.',
    )
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
    expect((screen.getByLabelText('Final prompt preview') as HTMLTextAreaElement).value).toContain(
      'Recreate the image as a true-to-life photograph captured with Sony A7R V and 35mm f/1.8.',
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

    expect(await screen.findByLabelText('Replace image')).toBeInTheDocument()
    expect(screen.getByAltText('Selected reference preview')).toHaveAttribute(
      'src',
      'blob:desert-reference.jpg',
    )

    fireEvent.change(input, {
      target: { files: [secondFile] },
    })

    await waitFor(() => {
      expect(screen.getByAltText('Selected reference preview')).toHaveAttribute(
        'src',
        'blob:landmark-reference.png',
      )
    })

    fireEvent.click(screen.getByLabelText('Remove image'))

    await waitFor(() => {
      expect(screen.queryByAltText('Selected reference preview')).not.toBeInTheDocument()
    })
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

  it('resets the form and clears the local preview', async () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('Preset'), {
      target: { value: 'couple-travel-photo' },
    })
    fireEvent.change(screen.getByLabelText('Additional user guidance'), {
      target: { value: 'Keep the sky slightly softer.' },
    })
    fireEvent.change(screen.getByLabelText('Upload reference image'), {
      target: {
        files: [new File(['preview'], 'travel-photo.jpg', { type: 'image/jpeg' })],
      },
    })

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

  it('shows a non-blocking warning when people presence overrides the scene recommendation', async () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('Scene category'), {
      target: { value: 'portrait' },
    })

    await waitFor(() => {
      expect(screen.getByLabelText('People presence')).toHaveValue('one-person')
    })

    fireEvent.change(screen.getByLabelText('People presence'), {
      target: { value: 'no-people' },
    })

    expect(screen.getByText(/This scene usually pairs with one person\./i)).toBeInTheDocument()
  })

  it('restores saved form state from localStorage but not any reference image preview', () => {
    localStorage.setItem(
      IMAGE_RECREATION_PROMPTS_STORAGE_KEY,
      JSON.stringify({
        presetId: 'custom',
        sceneCategory: 'city-street-scene',
        peoplePresence: 'small-group',
        peopleHandling: 'keep-people-secondary',
        primarySubjectEmphasis: 'balanced-scene',
        cameraPreset: 'leica-q3',
        lensPreset: '28mm-f2',
        captureStyle: 'street-photography',
        aspectRatio: '16-9-widescreen',
        filterLook: 'iphone-vivid',
        lighting: 'blue-hour',
        preservationStrength: 'balanced',
        allowedVariation: 'minor-secondary-detail-changes',
        environmentEnhancement: 'moderate-realism-boost',
        extraInstructions: 'Keep storefront signage believable and understated.',
      }),
    )

    renderPage()

    expect(screen.getByLabelText('Scene category')).toHaveValue('city-street-scene')
    expect(screen.getByLabelText('Aspect ratio')).toHaveValue('16-9-widescreen')
    expect(screen.getByLabelText('Filter / color look')).toHaveValue('iphone-vivid')
    expect(screen.getByLabelText('Additional user guidance')).toHaveValue(
      'Keep storefront signage believable and understated.',
    )
    expect(screen.queryByAltText('Selected reference preview')).not.toBeInTheDocument()
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
