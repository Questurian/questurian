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

  it('shows grouped filter descriptions and vintage combo guidance', () => {
    renderPage()

    expect(
      screen.getByText('Leica M6 + 35mm vintage rangefinder lens + Kodak Tri-X 400'),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Filter / color look'), {
      target: { value: 'kodachrome-64' },
    })

    expect(
      screen.getByText(
        'Classic slide-film nostalgia with saturated travel color and old-magazine warmth.',
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
