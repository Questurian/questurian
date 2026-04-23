import { describe, expect, it } from 'vitest'
import { createFormStateFromPreset } from './config'
import { buildImageRecreationPrompt } from './promptBuilder'

describe('buildImageRecreationPrompt', () => {
  it('builds a shorter default landmark prompt while keeping the core people-free guardrail', () => {
    const result = buildImageRecreationPrompt(createFormStateFromPreset())
    const detailedPrompt = result.blocks.map((block) => block.text).join('\n\n')

    expect(result.finalPrompt).toContain(
      'Use the uploaded reference image as the exact subject, composition base, and scene category.'
    )
    expect(result.finalPrompt).toContain(
      'Recreate the image as a true-to-life travel photography photograph captured with Sony A7R V and 24mm f/1.4.'
    )
    expect(result.finalPrompt).toContain('Do not add any people.')
    expect(result.finalPrompt.length).toBeLessThan(detailedPrompt.length)
  })

  it('places the people override directly after the selected people strategy', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset('city-square-blue-hour'),
      peopleStrategy: 'reduce',
      peopleOverrideText:
        'Keep one couple near the center and remove everyone else.'
    })

    expect(result.finalPrompt).toContain(
      'Thin the visible people naturally while keeping the place believable, without turning the scene into an empty synthetic cleanup.'
    )
    expect(result.finalPrompt).toContain(
      'People override: Keep one couple near the center and remove everyone else.'
    )
    expect(
      result.finalPrompt.indexOf('Thin the visible people naturally')
    ).toBeLessThan(result.finalPrompt.indexOf('People override:'))
  })

  it('promotes creative direction into the main prompt body instead of the old last-mile slot', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset(),
      creativeDirection:
        'Keep the landmark dominant, soften the sky, and keep the travel finish clean and believable.'
    })

    const creativeBlockIndex = result.blocks.findIndex(
      (block) => block.title === 'Creative direction'
    )
    const negativeBlockIndex = result.blocks.findIndex(
      (block) => block.id === 'negative-instructions'
    )

    expect(result.finalPrompt).toContain(
      'Apply this creative direction while respecting the reference scene and preservation rules: Keep the landmark dominant, soften the sky, and keep the travel finish clean and believable.'
    )
    expect(creativeBlockIndex).toBeGreaterThan(-1)
    expect(creativeBlockIndex).toBeLessThan(negativeBlockIndex)
  })

  it('keeps advanced style controls active when they are explicitly changed', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset('vintage-street-scene'),
      captureStyle: 'food-editorial',
      lighting: 'golden-hour',
      filterLook: 'kodachrome-64'
    })

    expect(result.finalPrompt).toContain(
      'Recreate the image as a true-to-life food editorial photograph captured with Leica M6 and 35mm vintage rangefinder lens.'
    )
    expect(result.finalPrompt).toContain(
      'Use warm late-day sunlight, long soft shadows, and realistic color.'
    )
    expect(result.finalPrompt).toContain(
      'Use a Kodachrome 64-inspired palette with rich travel color, warm editorial nostalgia, and slide-film clarity.'
    )
  })

  it('supports finer sun and cloud lighting combinations in the prompt body', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset(),
      lighting: 'sun-through-thin-cloud'
    })

    expect(result.finalPrompt).toContain(
      'Use sunlight filtered through thin cloud, with softened edges, bright cloud detail, and realistic low-contrast shadowing.'
    )
    expect(result.finalPrompt).toContain(
      'Keep shadows, highlights, and atmospheric depth physically believable.'
    )
  })

  it('lets a people-free source still use recast-or-add language when requested', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset(),
      referenceHasPeople: false,
      peopleStrategy: 'recast-or-add'
    })

    expect(result.finalPrompt).toContain(
      'You may introduce plausible people if needed, or keep the scene empty if that better matches the override and creative direction.'
    )
    expect(result.finalPrompt).not.toContain('Do not add any people.')
  })
})
