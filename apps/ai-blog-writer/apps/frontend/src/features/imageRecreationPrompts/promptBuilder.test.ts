import { describe, expect, it } from 'vitest'
import { createFormStateFromPreset } from './config'
import { buildImageRecreationPrompt } from './promptBuilder'

describe('buildImageRecreationPrompt', () => {
  it('builds a shorter default landmark prompt while keeping the core no-people guardrail', () => {
    const result = buildImageRecreationPrompt(createFormStateFromPreset())
    const detailedPrompt = result.blocks.map((block) => block.text).join('\n\n')

    expect(result.finalPrompt).toContain(
      'Use the uploaded reference image as the exact subject, composition base, and scene category.',
    )
    expect(result.finalPrompt).toContain(
      'Recreate it as a true-to-life travel photography photograph captured with Sony A7R V and 24mm f/1.4.',
    )
    expect(result.finalPrompt).toContain('Do not add any people.')
    expect(result.finalPrompt.length).toBeLessThan(detailedPrompt.length)
  })

  it('preserves crowd language without inventing theatrical foreground characters', () => {
    const state = {
      ...createFormStateFromPreset('city-square-blue-hour'),
      sceneCategory: 'tourist-landmark-crowd' as const,
      peoplePresence: 'dense-crowd' as const,
      peopleHandling: 'environment-dominant-with-people' as const,
      crowdCharacter: 'international-tourist-mix' as const,
    }

    const result = buildImageRecreationPrompt(state)

    expect(result.finalPrompt).toContain(
      'Keep the same dense crowd, but keep the landmark or environment clearly dominant.',
    )
    expect(result.finalPrompt).toContain(
      'Give the people an international tourist feel.',
    )
  })

  it('injects lighting-specific language into the final prompt', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset('desert-landscape-editorial'),
      lighting: 'golden-hour',
    })

    expect(result.finalPrompt).toContain(
      'Use warm late-day sunlight, long soft shadows, and realistic color.',
    )
    expect(result.finalPrompt).toContain(
      'Any new or intensified lighting should create realistic shadows and highlights with coherent direction, softness, density, and falloff.',
    )
    expect(result.finalPrompt).not.toContain('do not introduce new light sources')
  })

  it('supports indoor production lighting language in the final prompt', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset('couple-travel-photo'),
      lighting: 'indoor-production',
    })

    expect(result.finalPrompt).toContain(
      'Use a controlled indoor production-lighting setup with believable key, fill, and practical-light balance while keeping the result grounded as a real photograph rather than a synthetic studio render.',
    )
  })

  it('supports keeping the reference lighting unchanged', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset(),
      lighting: 'match-reference-lighting',
    })
    const lightingBlock = result.blocks.find((block) => block.id === 'lighting-description')

    expect(result.finalPrompt).toContain(
      'Keep the reference lighting setup essentially as-is. Do not push the image toward a different time of day, weather mood, or artificial lighting scheme unless the rest of the scene already supports it.',
    )
    expect(lightingBlock?.text).toContain(
      'Keep the reference lighting conditions aligned with the source image.',
    )
  })

  it('reinterprets the camera viewpoint when a non-reference shot perspective is selected', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset(),
      shotPerspective: 'ground-level-dramatic',
    })

    expect(result.finalPrompt).toContain(
      'Use a ground-level dramatic viewpoint while keeping the same spatial layout.',
    )
    expect(result.finalPrompt).not.toContain(
      'Match the original framing, perspective, spatial relationships, and composition intent before making any realism upgrades.',
    )
  })

  it('adds centered composition guidance when the composition checkbox is enabled', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset('couple-travel-photo'),
      centerMainSubject: true,
    })

    expect(result.finalPrompt).toContain(
      'Center the main subject in the composition and create a more symmetrical, balanced image. Align the subject along the vertical center axis, correct any tilt or perspective distortion, and evenly distribute visual weight on both sides of the frame. Straighten lines where needed, improve framing so the scene feels intentional and harmonious, and keep the result realistic and natural to the original image.',
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

  it('supports lighter modern-vintage filter looks without pushing the image too far into retro styling', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset(),
      filterLook: 'modern-vintage-soft-warm',
    })

    expect(result.finalPrompt).toContain(
      'Use a modern-vintage treatment with gentle analog warmth, preserved contrast, subtle highlight rolloff, and a clean current editorial finish rather than a heavy retro effect.',
    )
  })

  it('supports subtle grain without turning the image into a dusty damaged vintage effect', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset(),
      filterLook: 'subtle-analog-grain',
    })

    expect(result.finalPrompt).toContain(
      'Use a mostly modern color treatment with preserved contrast and ultra-fine analog grain. Keep the grain subtle and even, not dusty, speckled, scratched, or damaged.',
    )
  })

  it('supports new flagship gear and deeper vintage filters in the compact prompt', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset('vintage-street-scene'),
      cameraPreset: 'canon-r1',
      lensPreset: '28-70mm-f2',
      filterLook: 'kodachrome-64',
    })

    expect(result.finalPrompt).toContain(
      'Recreate it as a true-to-life filmic vintage photograph captured with Canon R1 and 28-70mm f/2.',
    )
    expect(result.finalPrompt).toContain(
      'Use a Kodachrome 64-inspired palette with rich travel color, warm editorial nostalgia, and slide-film clarity.',
    )
  })

  it('supports newer capture styles like food editorial in the compact prompt', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset(),
      captureStyle: 'food-editorial',
    })

    expect(result.finalPrompt).toContain(
      'Recreate it as a true-to-life food editorial photograph captured with Sony A7R V and 24mm f/1.4.',
    )
  })

  it('supports leaving capture style unchanged', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset(),
      captureStyle: 'match-reference-style',
    })
    const styleBlock = result.blocks.find((block) => block.id === 'style-description')

    expect(result.finalPrompt).toContain(
      'Recreate it as a true-to-life photograph captured with Sony A7R V and 24mm f/1.4.',
    )
    expect(result.finalPrompt).not.toContain(
      'true-to-life match reference / no change photograph',
    )
    expect(styleBlock?.text).toContain(
      'Keep the overall photographic treatment aligned with the reference image.',
    )
  })

  it('supports leaving people handling unchanged', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset('couple-travel-photo'),
      peopleHandling: 'match-reference-people-handling',
      primarySubjectEmphasis: 'match-reference-subject-balance',
      preservationStrength: 'match-reference-preservation',
      environmentEnhancement: 'match-reference-environment',
    })

    expect(result.finalPrompt).toContain(
      'Keep the same two people without forcing extra removals, additions, or recasting.',
    )
    expect(result.finalPrompt).toContain(
      'Do not push additional environment enhancement beyond the reference image.',
    )
  })

  it('includes a built-in guardrail against distorted faces and facial features', () => {
    const result = buildImageRecreationPrompt(createFormStateFromPreset('couple-travel-photo'))

    expect(result.finalPrompt).toContain(
      'Avoid face distortion, oversharpening, fake HDR, and unnatural contrast.',
    )
  })

  it('adds small-face integrity guidance only when people are visible in the result', () => {
    const peopleVisibleResult = buildImageRecreationPrompt(
      createFormStateFromPreset('couple-travel-photo'),
    )
    const peopleFreeResult = buildImageRecreationPrompt(createFormStateFromPreset())

    expect(peopleVisibleResult.finalPrompt).toContain(
      'Keep small or distant people low-detail but believable; do not warp, clone, melt, or over-sharpen tiny faces or human features.',
    )
    expect(peopleFreeResult.finalPrompt).not.toContain(
      'Keep small or distant people low-detail but believable; do not warp, clone, melt, or over-sharpen tiny faces or human features.',
    )
  })

  it('omits crowd-character language when the scene remains strictly people-free', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset(),
      crowdCharacter: 'international-tourist-mix',
    })

    expect(result.finalPrompt).not.toContain('international tourist mix')
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
      'Stay strict about scene preservation.',
    )
    expect(balancedResult.finalPrompt).toContain(
      'Preserve the core image with only subtle natural variation.',
    )
    expect(flexibleResult.finalPrompt).toContain(
      'Allow restrained reinterpretation while keeping the same scene identity.',
    )
  })

  it('lets the new people-expansion mode override fixed-count and no-people guardrails', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset(),
      peoplePresence: 'no-people',
      peopleHandling: 'reshuffle-and-add-people-naturally',
      primarySubjectEmphasis: 'person-first',
      preservationStrength: 'strict',
      allowedVariation: 'small-positional-shifts',
    })

    expect(result.finalPrompt).toContain(
      'The reference may be empty, but restrained human presence may be introduced if needed; keep it plausible and natural.',
    )
    expect(result.finalPrompt).toContain(
      'Do not remove existing people.',
    )
    expect(result.finalPrompt).toContain(
      'Limit changes to small positional shifts only.',
    )
    expect(result.finalPrompt).not.toContain(
      'Do not add, remove, or replace any people.',
    )
    expect(result.finalPrompt).not.toContain(
      'Do not add any people.',
    )
  })

  it('lets the recast mode replace the full human cast without changing the scene itself', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset('city-square-blue-hour'),
      peoplePresence: 'small-group',
      peopleHandling: 'change-every-person-and-reshuffle',
      primarySubjectEmphasis: 'person-first',
      preservationStrength: 'balanced',
      allowedVariation: 'small-positional-shifts',
    })

    expect(result.finalPrompt).toContain(
      'Recast the people to fit a believable small group setup, with natural styling, spacing, and pose variation.',
    )
    expect(result.finalPrompt).toContain(
      'Only change people as needed to match the selected people presence.',
    )
    expect(result.finalPrompt).not.toContain(
      'Preserve the original subject count unless the allowed-variation setting explicitly permits limited micro-adjustments for those same existing subjects.',
    )
  })

  it('lets the reduce mode remove only a few people without allowing new ones', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset('city-square-blue-hour'),
      peoplePresence: 'dense-crowd',
      peopleHandling: 'reduce-a-few-people',
      allowedVariation: 'small-positional-shifts',
    })

    expect(result.finalPrompt).toContain(
      'Allow only a slight reduction from the dense crowd scene by removing a few existing people; do not add or replace anyone.',
    )
    expect(result.finalPrompt).toContain(
      'Remove only a small number of existing people, and do not add or replace anyone.',
    )
    expect(result.finalPrompt).not.toContain(
      'introduce additional people when needed',
    )
  })

  it('supports a strict mode that removes everyone from the photo', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset('city-square-blue-hour'),
      peoplePresence: 'no-people',
      peopleHandling: 'remove-all-people',
      crowdCharacter: 'international-tourist-mix',
      allowedVariation: 'small-environmental-cleanup',
    })
    const detailedPrompt = result.blocks.map((block) => block.text).join('\n\n')

    expect(result.finalPrompt).toContain(
      'Remove all people from the frame and keep the scene convincingly people-free.',
    )
    expect(result.finalPrompt).toContain(
      'Do not add any people.',
    )
    expect(detailedPrompt).toContain(
      'Remove all existing people cleanly and do not replace them with new subjects.',
    )
    expect(result.finalPrompt).not.toContain(
      'international tourist feel',
    )
  })

  it('keeps the no-people guardrail when recast mode is paired with no-people', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset(),
      peoplePresence: 'no-people',
      peopleHandling: 'change-every-person-and-reshuffle',
      allowedVariation: 'small-positional-shifts',
    })

    expect(result.finalPrompt).toContain(
      'Remove people from the frame and keep the scene convincingly people-free.',
    )
    expect(result.finalPrompt).toContain(
      'Do not add any people.',
    )
    expect(result.finalPrompt).not.toContain(
      'Changed or replaced people are allowed only when the resulting human presence stays plausible, naturally integrated, and consistent with the selected people setting.',
    )
  })

  it('never allows variation settings to create new subjects', () => {
    const result = buildImageRecreationPrompt({
      ...createFormStateFromPreset('couple-travel-photo'),
      allowedVariation: 'small-positional-shifts',
    })

    expect(result.finalPrompt).toContain(
      'Limit changes to small positional shifts only.',
    )
    expect(result.finalPrompt).toContain(
      'Do not add, remove, or replace any people.',
    )
  })
})
