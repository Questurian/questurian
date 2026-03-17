import { describe, expect, it } from 'vitest'
import { createFormStateFromPreset } from './config'
import { buildImageRecreationPrompt } from './promptBuilder'

describe('buildImageRecreationPrompt', () => {
  it('builds a strong default landmark prompt with duplicated no-people guardrails', () => {
    const result = buildImageRecreationPrompt(createFormStateFromPreset())

    expect(result.finalPrompt).toContain(
      'Use the uploaded reference image as the exact subject, composition base, and scene category.',
    )
    expect(result.finalPrompt).toContain(
      'Recreate the image as a true-to-life photograph captured with Sony A7R V and 24mm f/1.4.',
    )

    const matches =
      result.finalPrompt.match(
        /Do not add any people\. If no people are present in the reference image, the output must contain no people\./g,
      ) ?? []

    expect(matches).toHaveLength(2)
  })

  it('preserves crowd language without inventing theatrical foreground characters', () => {
    const state = {
      ...createFormStateFromPreset('city-square-blue-hour'),
      sceneCategory: 'tourist-landmark-crowd' as const,
      peoplePresence: 'dense-crowd' as const,
      peopleHandling: 'keep-environment-primary' as const,
    }

    const result = buildImageRecreationPrompt(state)

    expect(result.finalPrompt).toContain(
      'Preserve the crowd density as part of the real scene without inventing theatrical or exaggerated foreground characters.',
    )
    expect(result.finalPrompt).toContain(
      'Preserve the fact that the scene contains a crowd, but do not invent a completely different crowd composition',
    )
  })

  it('injects lighting-specific language into the final prompt', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset('desert-landscape-editorial'),
      lighting: 'golden-hour',
    })

    expect(result.finalPrompt).toContain(
      'Use warm low-angle sunlight, long soft shadows, and rich but realistic color.',
    )
  })

  it('adds conservative reframing language when a custom aspect ratio is selected', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset(),
      aspectRatio: '16-9-widescreen',
    })

    expect(result.finalPrompt).toContain(
      'Render the final image in a 16:9 widescreen frame while keeping the reference composition dominant and using only restrained reframing.',
    )
    expect(result.finalPrompt).toContain(
      'If reframing is necessary for the selected output ratio, do it conservatively and do not invent missing off-frame content.',
    )
    expect(result.finalPrompt).toContain(
      'Do not invent new off-frame scenery, architecture, sky detail, people, or props just to satisfy the selected aspect ratio.',
    )
  })

  it('injects the selected filter look into the style language', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset(),
      filterLook: 'iphone-vivid',
    })

    expect(result.finalPrompt).toContain(
      'Use an iPhone-like vivid look with slightly stronger color and contrast, while keeping skin, sky, and environmental detail realistic and controlled.',
    )
  })

  it('switches preservation wording between strict, balanced, and flexible modes', () => {
    const strictResult = buildImageRecreationPrompt({
      ...createFormStateFromPreset(),
      preservationStrength: 'strict',
    })
    const balancedResult = buildImageRecreationPrompt({
      ...createFormStateFromPreset(),
      preservationStrength: 'balanced',
    })
    const flexibleResult = buildImageRecreationPrompt({
      ...createFormStateFromPreset(),
      preservationStrength: 'flexible',
    })

    expect(strictResult.finalPrompt).toContain(
      'Preserve the scene structure, subject count, composition intent, and major elements very closely.',
    )
    expect(balancedResult.finalPrompt).toContain(
      'Preserve the core image faithfully while allowing subtle natural variation that does not change the image identity.',
    )
    expect(flexibleResult.finalPrompt).toContain(
      'Preserve the scene category and core subject while allowing restrained reinterpretation of minor details.',
    )
  })

  it('never allows variation settings to create new subjects', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset('couple-travel-photo'),
      allowedVariation: 'small-positional-shifts',
    })

    expect(result.finalPrompt).toContain(
      'Allow only small positional shifts for people already present, without changing subject count or creating new focal subjects.',
    )
    expect(result.finalPrompt).toContain(
      'Any allowed variation must stay subordinate to the original scene and may never create subjects that were not already present in the reference image.',
    )
  })
})
