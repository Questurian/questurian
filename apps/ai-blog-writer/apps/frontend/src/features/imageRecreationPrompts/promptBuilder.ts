import {
  CAMERA_PRESET_MAP,
  CAPTURE_STYLE_MAP,
  ENVIRONMENT_ENHANCEMENT_MAP,
  FILTER_LOOK_MAP,
  LENS_PRESET_MAP,
  LIGHTING_MAP,
  PRESERVATION_STRENGTH_MAP,
  SCENE_CATEGORY_MAP,
  SHOT_PERSPECTIVE_MAP
} from './config'
import type {
  ImageRecreationFormState,
  PromptBlock,
  PromptBuildResult
} from './types'

const CENTER_MAIN_SUBJECT_PROMPT =
  'Center the main subject in the composition and create a more symmetrical, balanced image. Align the subject along the vertical center axis, correct any tilt or perspective distortion, and evenly distribute visual weight on both sides of the frame. Straighten lines where needed, improve framing so the scene feels intentional and harmonious, and keep the result realistic and natural to the original image.'

function joinSentences(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
}

function usesPerspectiveOverride(state: ImageRecreationFormState): boolean {
  return state.shotPerspective !== 'match-reference-viewpoint'
}

function resultCanContainPeople(state: ImageRecreationFormState): boolean {
  switch (state.peopleStrategy) {
    case 'remove':
      return false
    case 'recast-or-add':
      return true
    case 'reduce':
    case 'keep':
    case 'match-source':
      return state.referenceHasPeople
  }
}

function resolveReferencePeopleAnchorPrompt(
  state: ImageRecreationFormState
): string {
  return state.referenceHasPeople
    ? 'The reference image contains visible people, so treat that human presence as real scene information unless the selected people strategy or override changes it.'
    : 'The reference image contains no visible people, so keep the scene people-free unless the selected people strategy or override changes it.'
}

function resolvePerspectiveAnchorPrompt(
  state: ImageRecreationFormState
): string {
  if (!usesPerspectiveOverride(state)) {
    return 'Match the original framing, perspective, spatial relationships, and composition intent before making realism upgrades.'
  }

  const perspective = SHOT_PERSPECTIVE_MAP[state.shotPerspective]

  return `Keep the reference image as the source of truth for scene layout, but reinterpret the camera position toward a ${perspective.label.toLowerCase()} viewpoint.`
}

function buildSceneSpecificPrompt(state: ImageRecreationFormState): string {
  switch (state.sceneCategory) {
    case 'landscape-only':
      return 'Keep terrain, atmosphere, scale, and natural depth dominant.'
    case 'scenic-viewpoint':
      return 'Preserve the overlook structure, the sense of elevation, and the depth cues that make the viewpoint read clearly.'
    case 'tourist-landmark':
      return 'Keep the landmark clearly dominant and preserve the sense of a real destination rather than a generic travel backdrop.'
    case 'city-street-scene':
      return 'Preserve the public-space rhythm, storefront logic, and believable city circulation.'
    case 'street-art-mural':
      return 'Keep the mural or painted surface readable and faithful to the original artwork.'
    case 'market-food-stall':
      return 'Preserve the stall layout, display density, and authentic market rhythm.'
    case 'restaurant-interior':
    case 'cafe-interior':
      return 'Keep the seating layout, table spacing, counter rhythm, materials, and hospitality atmosphere faithful to the original interior.'
    case 'restaurant-exterior':
    case 'cafe-exterior':
    case 'boutique-shopfront':
      return 'Preserve the facade, signage, terrace or sidewalk setup, and the real street context of the place.'
    case 'cafe-restaurant-scene':
      return 'Keep the seating layout, service setup, and dining atmosphere faithful to the original scene.'
    case 'plated-food-close-up':
      return 'Preserve the exact dish identity, plating, garnish, plateware, and edible texture so the result still reads as the same meal.'
    case 'tabletop-food-spread':
      return 'Preserve the tabletop arrangement, dish count, servingware, and meal structure.'
    case 'coffee-drinks-table':
      return 'Keep the cups, glassware, tabletop styling, and drink texture grounded in the original cafe or bar setting.'
    case 'bakery-pastry-display':
      return 'Preserve the pastry arrangement, display geometry, and appetizing texture detail.'
    case 'bar-cocktail-scene':
      return 'Keep the bar layout, glassware, bottle display, and nightlife hospitality mood grounded in the original venue.'
    case 'hotel-lobby-interior':
      return 'Preserve the lobby circulation, seating clusters, reception elements, and hospitality feel of the original interior.'
    case 'hotel-room-interior':
      return 'Keep the bed placement, furniture layout, window relationship, and believable styling of the original room.'
    case 'spa-wellness-interior':
      return 'Preserve the calm spa layout, material palette, and wellness atmosphere without turning the space into a generic luxury render.'
    case 'poolside-resort-scene':
      return 'Keep the pool geometry, loungers, umbrellas, water behavior, and relaxed resort atmosphere anchored to the original scene.'
    case 'rooftop-terrace-view':
      return 'Preserve the elevated viewpoint, terrace edge geometry, and the relationship between the platform and the surrounding view.'
    case 'nightlife-neon-scene':
      return 'Keep the nightlife scene grounded in real signage, street layout, and practical after-dark atmosphere.'
    case 'architecture-exterior':
      return 'Preserve facade geometry, material character, and the building’s relationship to its surroundings.'
    case 'architecture-interior':
      return 'Preserve interior geometry, circulation, and material realism without over-staging the space.'
    case 'museum-gallery-interior':
      return 'Preserve gallery layout, display spacing, lighting, and visitor flow.'
    case 'portrait':
      return 'Keep the portrait grounded in a real photographic moment rather than a synthetic beauty render.'
    case 'couple-friends-photo':
      return 'Keep the relationship between the people and the environment believable, natural, and emotionally coherent.'
    case 'group-photo':
      return 'Keep the group arrangement, spacing, and interpersonal relationships believable and photographic.'
    case 'lifestyle-candid-people':
      return 'Preserve the candid, unstaged feel of the human moment and surrounding environment.'
    case 'product-object':
      return 'Preserve the exact product or object identity, proportions, materials, and setting.'
    case 'nature-wilderness':
      return 'Keep the scene rooted in natural terrain, atmosphere, and real environmental scale.'
    case 'beach-coastal':
      return 'Preserve shoreline structure, water behavior, coastal atmosphere, and believable light.'
    case 'mountain-hiking':
      return 'Keep the mountain scale, trail logic, and elevated outdoor atmosphere intact.'
    case 'desert-rock-formations':
      return 'Preserve the geology, texture, scale, and atmospheric depth of the desert landscape.'
  }
}

function resolvePeopleStrategyPrompt(state: ImageRecreationFormState): string {
  switch (state.peopleStrategy) {
    case 'match-source':
      return state.referenceHasPeople
        ? 'Match the source people situation: keep the existing people naturally integrated and do not invent new people or remove existing ones unless the override text explicitly says to.'
        : 'Match the source people situation: keep the result people-free unless the override text explicitly says otherwise.'
    case 'keep':
      return state.referenceHasPeople
        ? 'Keep the existing people naturally integrated in the same scene role; do not add or remove people unless the override text explicitly says to.'
        : 'The reference is already people-free, so keep the result people-free.'
    case 'reduce':
      return state.referenceHasPeople
        ? 'Thin the visible people naturally while keeping the place believable, without turning the scene into an empty synthetic cleanup.'
        : 'The reference is marked people-free, so there are no visible people to reduce; keep the result people-free unless the override text introduces a different people treatment.'
    case 'remove':
      return state.referenceHasPeople
        ? 'Remove all visible people from the frame and keep the resulting scene convincingly people-free.'
        : 'Keep the scene people-free and do not introduce any people.'
    case 'recast-or-add':
      return state.referenceHasPeople
        ? 'You may recast existing people or rebalance the human layer naturally, while keeping the place believable and photographic.'
        : 'You may introduce plausible people if needed, or keep the scene empty if that better matches the override and creative direction.'
  }
}

function resolveCreativeDirectionPrompt(
  state: ImageRecreationFormState
): string {
  const creativeDirection = state.creativeDirection.trim()
  if (!creativeDirection) return ''

  return `Apply this creative direction while respecting the reference scene and preservation rules: ${creativeDirection}`
}

function resolveLightingLeadSentence(state: ImageRecreationFormState): string {
  const lighting = LIGHTING_MAP[state.lighting]

  if (state.lighting === 'match-reference-lighting') {
    return 'Keep the reference lighting conditions aligned with the source image.'
  }

  return `Match ${lighting.label.toLowerCase()} lighting conditions.`
}

function resolveStyleLeadSentence(state: ImageRecreationFormState): string {
  const style = CAPTURE_STYLE_MAP[state.captureStyle]

  if (state.captureStyle === 'match-reference-style') {
    return 'Keep the overall photographic treatment aligned with the reference image.'
  }

  return `Keep the overall treatment grounded in ${style.label.toLowerCase()}.`
}

function buildNegativeInstructions(state: ImageRecreationFormState): string {
  const resultHasPeople = resultCanContainPeople(state)

  return joinSentences([
    'Do not change the identity of the place, landmark, dish, object, or overall scene into something else.',
    resultHasPeople
      ? 'Avoid face distortion, oversharpening, plastic skin, fake HDR, and unnatural contrast.'
      : 'Do not add any people.',
    resultHasPeople
      ? 'Keep small or distant people low-detail but believable; do not warp, clone, melt, or over-sharpen tiny faces or human features.'
      : 'Keep the frame convincingly people-free with no leftover human artifacts or synthetic cleanup traces.',
    'Maintain realistic light, shadows, depth, atmosphere, and color.'
  ])
}

export function buildImageRecreationPrompt(
  state: ImageRecreationFormState
): PromptBuildResult {
  const scene = SCENE_CATEGORY_MAP[state.sceneCategory]
  const camera = CAMERA_PRESET_MAP[state.cameraPreset]
  const lens = LENS_PRESET_MAP[state.lensPreset]
  const style = CAPTURE_STYLE_MAP[state.captureStyle]
  const lighting = LIGHTING_MAP[state.lighting]
  const filterLook = FILTER_LOOK_MAP[state.filterLook]
  const environmentEnhancement =
    ENVIRONMENT_ENHANCEMENT_MAP[state.environmentEnhancement]
  const preservationStrength =
    PRESERVATION_STRENGTH_MAP[state.preservationStrength]
  const peopleOverride = state.peopleOverrideText.trim()

  const blocks: PromptBlock[] = [
    {
      id: 'reference-anchoring',
      title: 'Reference anchoring',
      text: joinSentences([
        'Use the uploaded reference image as the exact subject, composition base, and scene category.',
        'Treat the reference image as the source of truth for what exists in the frame and how the composition is arranged.',
        resolveReferencePeopleAnchorPrompt(state),
        resolvePerspectiveAnchorPrompt(state)
      ])
    },
    {
      id: 'scene-preservation',
      title: 'Scene preservation rules',
      text: joinSentences([
        scene.prompt,
        buildSceneSpecificPrompt(state),
        preservationStrength.prompt,
        state.centerMainSubject ? CENTER_MAIN_SUBJECT_PROMPT : ''
      ])
    },
    {
      id: 'people-preservation',
      title: 'People strategy',
      text: joinSentences([
        resolvePeopleStrategyPrompt(state),
        peopleOverride ? `People override: ${peopleOverride}` : ''
      ])
    }
  ]

  const creativeDirectionPrompt = resolveCreativeDirectionPrompt(state)

  if (creativeDirectionPrompt) {
    blocks.push({
      id: 'user-guidance',
      title: 'Creative direction',
      text: creativeDirectionPrompt
    })
  }

  blocks.push(
    {
      id: 'camera-lens-realism',
      title: 'Camera and lens realism',
      text: joinSentences([
        state.captureStyle === 'match-reference-style'
          ? `Recreate the image as a true-to-life photograph captured with ${camera.label} and ${lens.label}.`
          : `Recreate the image as a true-to-life ${style.label.toLowerCase()} photograph captured with ${camera.label} and ${lens.label}.`,
        camera.prompt,
        lens.prompt,
        usesPerspectiveOverride(state)
          ? `Shift the camera viewpoint toward ${SHOT_PERSPECTIVE_MAP[state.shotPerspective].label.toLowerCase()} while keeping the scene physically believable.`
          : ''
      ])
    },
    {
      id: 'lighting-description',
      title: 'Lighting description',
      text: joinSentences([
        resolveLightingLeadSentence(state),
        lighting.prompt,
        'Keep shadows, highlights, and atmospheric depth physically believable.'
      ])
    },
    {
      id: 'style-description',
      title: 'Style description',
      text: joinSentences([
        resolveStyleLeadSentence(state),
        state.filterLook === 'neutral-no-filter' ? '' : filterLook.prompt
      ])
    },
    {
      id: 'environment-realism',
      title: 'Environment realism upgrades',
      text: joinSentences([
        environmentEnhancement.prompt,
        'Keep any realism upgrades subordinate to the original scene identity.'
      ])
    },
    {
      id: 'negative-instructions',
      title: 'Negative instructions',
      text: buildNegativeInstructions(state)
    }
  )

  const cameraLensBlock = blocks.find(
    (block) => block.id === 'camera-lens-realism'
  )
  const lightingBlock = blocks.find(
    (block) => block.id === 'lighting-description'
  )
  const styleBlock = blocks.find((block) => block.id === 'style-description')
  const environmentBlock = blocks.find(
    (block) => block.id === 'environment-realism'
  )
  const negativeBlock = blocks.find(
    (block) => block.id === 'negative-instructions'
  )

  const compactSections = [
    blocks[0].text,
    blocks[1].text,
    blocks[2].text,
    creativeDirectionPrompt,
    joinSentences([
      cameraLensBlock?.text,
      lightingBlock?.text,
      styleBlock?.text,
      environmentBlock?.text
    ]),
    negativeBlock?.text
  ].filter(Boolean)

  return {
    blocks,
    finalPrompt: compactSections.join('\n\n')
  }
}
