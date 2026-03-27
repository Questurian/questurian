import {
  ALLOWED_VARIATION_MAP,
  CAMERA_PRESET_MAP,
  CAPTURE_STYLE_MAP,
  CROWD_CHARACTER_MAP,
  ENVIRONMENT_ENHANCEMENT_MAP,
  FILTER_LOOK_MAP,
  LENS_PRESET_MAP,
  LIGHTING_MAP,
  PEOPLE_HANDLING_MAP,
  PEOPLE_PRESENCE_MAP,
  PRESERVATION_STRENGTH_MAP,
  PRIMARY_SUBJECT_MAP,
  SCENE_CATEGORY_MAP,
  SHOT_PERSPECTIVE_MAP,
} from './config'
import type { ImageRecreationFormState, PromptBlock, PromptBuildResult } from './types'

const NO_PEOPLE_GUARDRAIL =
  'Do not add any people. If no people are present in the reference image, the output must contain no people.'
const CENTER_MAIN_SUBJECT_PROMPT =
  'Center the main subject in the composition and create a more symmetrical, balanced image. Align the subject along the vertical center axis, correct any tilt or perspective distortion, and evenly distribute visual weight on both sides of the frame. Straighten lines where needed, improve framing so the scene feels intentional and harmonious, and keep the result realistic and natural to the original image.'

function joinSentences(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
}

function allowsAddedPeople(state: ImageRecreationFormState): boolean {
  return state.peopleHandling === 'reshuffle-and-add-people-naturally'
}

function allowsPeopleReduction(state: ImageRecreationFormState): boolean {
  return state.peopleHandling === 'reduce-a-few-people'
}

function removesAllPeople(state: ImageRecreationFormState): boolean {
  return state.peopleHandling === 'remove-all-people'
}

function allowsPeopleRecasting(state: ImageRecreationFormState): boolean {
  return state.peopleHandling === 'change-every-person-and-reshuffle'
}

function usesPeopleOverride(state: ImageRecreationFormState): boolean {
  return (
    allowsAddedPeople(state) ||
    allowsPeopleReduction(state) ||
    removesAllPeople(state) ||
    allowsPeopleRecasting(state)
  )
}

function hasVisiblePeopleLayer(state: ImageRecreationFormState): boolean {
  if (state.peoplePresence !== 'no-people') {
    return true
  }

  return allowsAddedPeople(state)
}

function usesPerspectiveOverride(state: ImageRecreationFormState): boolean {
  return state.shotPerspective !== 'match-reference-viewpoint'
}

function resolveReferencePeopleAnchorPrompt(state: ImageRecreationFormState): string {
  return state.referenceHasPeople
    ? 'The reference image does contain visible people, so treat that human presence as real scene information unless the selected people-handling rule changes it.'
    : 'The reference image contains no visible people, so keep the scene people-free unless the selected people-handling rule explicitly changes that.'
}

function resolvePrimarySubjectPrompt(state: ImageRecreationFormState): string {
  if (state.primarySubjectEmphasis === 'match-reference-subject-balance') {
    return 'Do not force a new focal hierarchy. Keep the same subject-environment balance the reference image already establishes.'
  }

  if (
    state.peoplePresence === 'no-people' &&
    state.primarySubjectEmphasis === 'person-first' &&
    !allowsAddedPeople(state)
  ) {
    return PRIMARY_SUBJECT_MAP['environment-first'].prompt
  }

  if (allowsAddedPeople(state) && state.primarySubjectEmphasis === 'person-first') {
    return 'Keep human presence as a natural focal layer, but make any added or reshuffled people feel plausible for the location, composition, and scene tone.'
  }

  if (allowsPeopleRecasting(state) && state.primarySubjectEmphasis === 'person-first') {
    return 'Keep people as the primary focal layer, but allow every visible person to be recast, restyled, and repositioned naturally so the scene still reads as a believable real photograph.'
  }

  return PRIMARY_SUBJECT_MAP[state.primarySubjectEmphasis].prompt
}

function resolvePerspectiveAnchorPrompt(state: ImageRecreationFormState): string {
  if (!usesPerspectiveOverride(state)) {
    return 'Match the original framing, perspective, spatial relationships, and composition intent before making any realism upgrades.'
  }

  const perspective = SHOT_PERSPECTIVE_MAP[state.shotPerspective]

  return `Keep the reference image as the source of truth for the scene, subject hierarchy, and spatial layout, but reinterpret the shot from a controlled ${perspective.label.toLowerCase()} viewpoint rather than copying the original camera position exactly.`
}

function resolveCenteredCompositionPrompt(state: ImageRecreationFormState): string {
  if (!state.centerMainSubject) {
    return ''
  }

  return CENTER_MAIN_SUBJECT_PROMPT
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

function resolveCompactStyleSentence(state: ImageRecreationFormState): string {
  const style = CAPTURE_STYLE_MAP[state.captureStyle]

  if (state.captureStyle === 'match-reference-style') {
    return ''
  }

  return `Recreate it as a true-to-life ${style.label.toLowerCase()} photograph captured with`
}

function buildSceneSpecificPrompt(state: ImageRecreationFormState): string {
  const peopleCanBeAdded = allowsAddedPeople(state)
  const peopleCanBeReduced = allowsPeopleReduction(state)
  const peopleAreRemoved = removesAllPeople(state)
  const peopleCanBeRecast = allowsPeopleRecasting(state)
  const visiblePeopleAllowed = state.peoplePresence !== 'no-people' || peopleCanBeAdded

  switch (state.sceneCategory) {
    case 'landscape-only':
      return !visiblePeopleAllowed
        ? 'Keep the scene rooted in terrain, atmosphere, scale, and natural light without any invented human activity.'
        : peopleCanBeAdded
          ? 'Keep terrain, atmosphere, and environmental scale dominant even if people are reshuffled or introduced naturally into the frame.'
          : peopleCanBeReduced
            ? 'Keep terrain, atmosphere, and environmental scale dominant even if a small number of existing people are removed from the frame.'
          : peopleAreRemoved
            ? 'Keep terrain, atmosphere, and environmental scale dominant while removing all people so the frame reads as a clean people-free landscape.'
          : peopleCanBeRecast
            ? 'Keep terrain, atmosphere, and environmental scale dominant even if the human cast is fully recast and redistributed within the frame.'
            : 'Keep terrain, atmosphere, and environmental scale dominant even if existing people remain in the frame.'
    case 'tourist-landmark-no-people':
      return !visiblePeopleAllowed
        ? 'Keep the landmark clean and free of invented tourists, crowds, or passersby.'
        : peopleCanBeAdded || peopleCanBeReduced || peopleCanBeRecast
          ? 'Keep the landmark dominant and ensure any changed, added, or reshuffled people read as believable secondary visitors rather than staged focal characters.'
          : peopleAreRemoved
            ? 'Keep the landmark dominant and remove all visible people so the scene reads as a clean people-free landmark photograph.'
          : 'Keep the landmark dominant and ensure any existing people remain clearly secondary to it.'
    case 'tourist-landmark-sparse-people':
      return 'Keep the landmark clearly dominant and preserve the believable feel of a lightly visited destination.'
    case 'tourist-landmark-crowd':
      return 'Keep the landmark or environment readable even when crowd activity is part of the real scene.'
    case 'city-street-scene':
      return 'Preserve whether the street feels empty, lightly populated, or crowded, matching the original urban rhythm.'
    case 'street-art-mural':
      return 'Keep the mural or street-art wall readable, grounded, and faithful to the original artwork instead of turning it into generic background texture.'
    case 'market-food-stall':
      return 'Preserve the real stall layout, display density, and market rhythm so the scene still feels like an authentic market rather than a styled set.'
    case 'restaurant-interior':
    case 'cafe-interior':
      return 'Keep the seating layout, table spacing, counter rhythm, materials, and hospitality atmosphere faithful to the original interior.'
    case 'restaurant-exterior':
    case 'cafe-exterior':
    case 'boutique-shopfront':
      return 'Preserve the facade, signage, terrace or sidewalk setup, and the real street context so the place still reads as the same travel stop.'
    case 'cafe-restaurant-scene':
      return 'Keep the seating layout, table spacing, service setup, and dining atmosphere faithful to the original scene.'
    case 'plated-food-close-up':
      return 'Preserve the exact dish identity, plating, garnish, plateware, and edible texture so the result still reads as the same meal rather than a different recipe.'
    case 'tabletop-food-spread':
      return 'Preserve the tabletop arrangement, dish count, servingware, and meal structure so the spread still reads as the same dining moment.'
    case 'coffee-drinks-table':
      return 'Keep the cups, glassware, tabletop styling, and drink texture grounded in the original cafe or bar setting instead of turning it into a generic ad render.'
    case 'bakery-pastry-display':
      return 'Preserve the pastry arrangement, display geometry, and appetizing texture detail so the bakery scene stays specific and believable.'
    case 'bar-cocktail-scene':
      return 'Keep the bar layout, glassware, bottle display, and nightlife hospitality mood grounded in the original venue.'
    case 'hotel-lobby-interior':
      return 'Preserve the lobby circulation, seating clusters, reception elements, and premium hospitality feel of the original interior.'
    case 'hotel-room-interior':
      return 'Keep the bed placement, furniture layout, window relationship, and believable hospitality styling of the original room.'
    case 'spa-wellness-interior':
      return 'Preserve the calm spa layout, material palette, and wellness atmosphere without turning the space into a generic luxury render.'
    case 'poolside-resort-scene':
      return 'Keep the pool geometry, loungers, umbrellas, water behavior, and relaxed resort atmosphere anchored to the original scene.'
    case 'rooftop-terrace-view':
      return 'Preserve the elevated viewpoint, terrace edge geometry, and the real relationship between the platform and the surrounding view.'
    case 'nightlife-neon-scene':
      return 'Keep the nightlife scene grounded in real signage, street layout, and practical after-dark atmosphere instead of exaggerated club-style staging.'
    case 'museum-gallery-interior':
      return 'Preserve the gallery layout, display spacing, lighting, and visitor rhythm so the cultural space still reads as the same place.'
    default:
      return ''
  }
}

function resolvePeoplePresencePrompt(state: ImageRecreationFormState): string {
  if (!usesPeopleOverride(state)) {
    return PEOPLE_PRESENCE_MAP[state.peoplePresence].prompt
  }

  if (removesAllPeople(state)) {
    return 'Remove all people from the frame and keep the scene convincingly people-free.'
  }

  if (allowsPeopleRecasting(state)) {
    switch (state.peoplePresence) {
      case 'no-people':
        return 'Remove all people from the frame and keep the scene convincingly people-free if the selected people setting is no people.'
      case 'one-person':
        return 'Recast the human presence as one believable person and let that single person define the human layer of the scene naturally.'
      case 'two-people':
        return 'Recast the human presence as a believable two-person pairing with natural spacing, body language, and scene integration.'
      case 'small-group':
        return 'Recast the human presence as a believable small group with natural spacing, varied poses, and realistic interaction.'
      case 'spread-out-crowd':
        return 'Recast the human presence as a believable spread-out crowd with natural spacing, movement, and varied background activity.'
      case 'dense-crowd':
        return 'Recast the human presence as a believable dense crowd with realistic flow, overlap, and crowd behavior rather than staged extras.'
    }
  }

  if (allowsPeopleReduction(state)) {
    switch (state.peoplePresence) {
      case 'no-people':
        return PEOPLE_PRESENCE_MAP[state.peoplePresence].prompt
      case 'one-person':
        return 'If a single person is present, you may remove that person only when the scene still feels natural without them. Do not add any replacement.'
      case 'two-people':
        return 'Allow a slight reduction from the original two-person scene by removing one person if needed, without introducing anyone new.'
      case 'small-group':
        return 'Allow a slight reduction in the small group by removing a few existing people while keeping the scene believable and naturally populated.'
      case 'spread-out-crowd':
        return 'Allow a slight thinning of the dispersed crowd by removing a few existing people while keeping the overall scene naturally populated.'
      case 'dense-crowd':
        return 'Allow a slight thinning of the dense crowd by removing a limited number of existing people while preserving the sense of a busy real scene.'
    }
  }

  switch (state.peoplePresence) {
    case 'no-people':
      return 'The reference image may have no visible people, but you may introduce restrained, believable human presence if it helps the scene feel natural rather than empty or staged.'
    case 'one-person':
      return 'Keep the frame anchored around a single primary person, while allowing subtle supporting human presence only when it feels plausible for the location.'
    case 'two-people':
      return 'Keep the frame anchored around a natural two-person focus, while allowing additional people only as believable supporting presence.'
    case 'small-group':
      return 'Aim for a believable small-group presence and allow people to be redistributed or added naturally without turning the scene into an oversized crowd.'
    case 'spread-out-crowd':
      return 'Aim for a believable spread-out crowd with natural spacing, varied body language, and no staged clustering.'
    case 'dense-crowd':
      return 'Aim for a believable dense crowd with natural movement and density rather than theatrical foreground characters.'
  }
}

function resolvePeopleHandlingPrompt(state: ImageRecreationFormState): string {
  if (removesAllPeople(state)) {
    return 'Clear the frame of all people entirely. Remove every visible person cleanly and do not add any replacement people.'
  }

  if (allowsPeopleRecasting(state) && state.peoplePresence === 'no-people') {
    return 'Do not preserve the original human cast. Remove any existing people from the frame so the final scene reads as convincingly people-free.'
  }

  if (allowsPeopleReduction(state) && state.peoplePresence === 'no-people') {
    return 'Keep the frame people-free. No additional human edits are needed, and no people should be introduced.'
  }

  return PEOPLE_HANDLING_MAP[state.peopleHandling].prompt
}

function resolveCrowdCharacterPrompt(state: ImageRecreationFormState): string {
  if (!hasVisiblePeopleLayer(state)) {
    return ''
  }

  return CROWD_CHARACTER_MAP[state.crowdCharacter].prompt
}

function resolveCompactSceneSentence(
  state: ImageRecreationFormState,
  sceneLabel: string,
  scenePrompt: string,
  sceneSpecificPrompt: string,
): string {
  if (allowsAddedPeople(state)) {
    return joinSentences([
      scenePrompt,
      sceneSpecificPrompt,
      `Keep the ${sceneLabel.toLowerCase()} scene structure, composition anchor, and subject hierarchy intact while allowing human presence to expand naturally if needed.`,
    ])
  }

  if (allowsPeopleReduction(state)) {
    return joinSentences([
      scenePrompt,
      sceneSpecificPrompt,
      `Keep the ${sceneLabel.toLowerCase()} scene structure, composition anchor, and subject hierarchy intact while allowing only slight thinning of the existing people.`,
    ])
  }

  if (removesAllPeople(state)) {
    return joinSentences([
      scenePrompt,
      sceneSpecificPrompt,
      `Keep the ${sceneLabel.toLowerCase()} scene structure, composition anchor, and subject hierarchy intact while removing all human presence from the frame.`,
    ])
  }

  if (allowsPeopleRecasting(state)) {
    return joinSentences([
      scenePrompt,
      sceneSpecificPrompt,
      `Keep the ${sceneLabel.toLowerCase()} scene structure, composition anchor, and subject hierarchy intact while allowing the human cast to be reinterpreted to match the selected people presence.`,
    ])
  }

  return joinSentences([scenePrompt, sceneSpecificPrompt])
}

function resolveCompactPerspectiveSentence(state: ImageRecreationFormState): string {
  return usesPerspectiveOverride(state)
    ? `Use a ${SHOT_PERSPECTIVE_MAP[state.shotPerspective].label.toLowerCase()} viewpoint while keeping the same spatial layout.`
    : ''
}

function resolveCompactPeopleSentence(state: ImageRecreationFormState): string {
  if (
    state.peoplePresence === 'no-people' &&
    !allowsAddedPeople(state) &&
    !removesAllPeople(state) &&
    !allowsPeopleRecasting(state)
  ) {
    return 'Keep the scene people-free; do not add any people.'
  }

  switch (state.peopleHandling) {
    case 'match-reference-people-handling':
      return state.peoplePresence === 'no-people'
        ? 'Keep the scene people-free unless another selected rule explicitly changes that.'
        : `Keep the same ${PEOPLE_PRESENCE_MAP[state.peoplePresence].label.toLowerCase()} without forcing extra removals, additions, or recasting.`
    case 'keep-every-person-as-is':
      return `Keep the same ${PEOPLE_PRESENCE_MAP[state.peoplePresence].label.toLowerCase()} and do not add, remove, or replace any people.`
    case 'keep-same-people-small-natural-changes':
      return `Keep the same ${PEOPLE_PRESENCE_MAP[state.peoplePresence].label.toLowerCase()} and allow only tiny natural expression, posture, or micro-detail changes.`
    case 'keep-same-people-small-repositioning':
      return `Keep the same ${PEOPLE_PRESENCE_MAP[state.peoplePresence].label.toLowerCase()} and allow only small believable repositioning, with no added or removed people.`
    case 'reduce-a-few-people':
      return state.peoplePresence === 'no-people'
        ? 'Keep the scene people-free; do not add any people.'
        : `Allow only a slight reduction from the ${PEOPLE_PRESENCE_MAP[state.peoplePresence].label.toLowerCase()} scene by removing a few existing people; do not add or replace anyone.`
    case 'remove-all-people':
      return 'Remove all people from the frame and keep the scene convincingly people-free.'
    case 'change-every-person-and-reshuffle':
      return state.peoplePresence === 'no-people'
        ? 'Remove people from the frame and keep the scene convincingly people-free.'
        : `Recast the people to fit a believable ${PEOPLE_PRESENCE_MAP[state.peoplePresence].label.toLowerCase()} setup, with natural styling, spacing, and pose variation.`
    case 'reshuffle-and-add-people-naturally':
      return state.peoplePresence === 'no-people'
        ? 'The reference may be empty, but restrained human presence may be introduced if needed; keep it plausible and natural.'
        : `Target a believable ${PEOPLE_PRESENCE_MAP[state.peoplePresence].label.toLowerCase()} human presence; you may add people and rebalance placement naturally, but do not remove existing people.`
    case 'people-secondary-environment-primary':
      return `Keep the same ${PEOPLE_PRESENCE_MAP[state.peoplePresence].label.toLowerCase()}, but make people secondary to the environment.`
    case 'environment-dominant-with-people':
      return `Keep the same ${PEOPLE_PRESENCE_MAP[state.peoplePresence].label.toLowerCase()}, but keep the landmark or environment clearly dominant.`
  }
}

function resolveCompactCrowdCharacterSentence(state: ImageRecreationFormState): string {
  if (!hasVisiblePeopleLayer(state) || state.crowdCharacter === 'match-reference-crowd') {
    return ''
  }

  switch (state.crowdCharacter) {
    case 'international-tourist-mix':
      return 'Give the people an international tourist feel.'
    case 'locals-dominant':
      return 'Lean toward a locals-dominant crowd.'
    case 'mixed-age-travelers':
      return 'Use a mixed-age traveler mix.'
    case 'family-heavy-travelers':
      return 'Lean toward family travel groups.'
    case 'adult-travelers':
      return 'Lean toward adult travelers, couples, and friend groups.'
    case 'backpacker-travel-crowd':
      return 'Lean toward a backpacker or independent-travel crowd.'
    case 'stylish-city-weekend-crowd':
      return 'Lean toward a stylish city-weekend crowd.'
    case 'understated-neutral-crowd':
      return 'Keep the crowd understated and neutral.'
  }

  return ''
}

function resolveHumanDetailIntegrityPrompt(state: ImageRecreationFormState): string {
  if (!hasVisiblePeopleLayer(state)) {
    return ''
  }

  return 'If people appear small, distant, or in the background, keep faces, heads, hands, and bodies softly natural and anatomically coherent. Do not force sharp facial detail into tiny subjects; when a face is too small to resolve clearly, keep it low-detail but believable instead of warped, cloned, melted, or over-sharpened.'
}

function resolveCompactHumanDetailSentence(state: ImageRecreationFormState): string {
  if (!hasVisiblePeopleLayer(state)) {
    return ''
  }

  return 'Keep small or distant people low-detail but believable; do not warp, clone, melt, or over-sharpen tiny faces or human features.'
}

function resolveCompactPreservationSentence(state: ImageRecreationFormState): string {
  switch (state.preservationStrength) {
    case 'strict':
      return 'Stay strict about scene preservation.'
    case 'balanced':
      return 'Preserve the core image with only subtle natural variation.'
    case 'flexible':
      return 'Allow restrained reinterpretation while keeping the same scene identity.'
  }
}

function resolveCompactVariationSentence(state: ImageRecreationFormState): string {
  switch (state.allowedVariation) {
    case 'no-variation':
      return 'Keep extra variation to a minimum.'
    case 'small-environmental-cleanup':
      return 'Limit changes to minor environmental cleanup.'
    case 'small-wardrobe-changes':
      return 'Limit changes to minor wardrobe detail shifts.'
    case 'small-positional-shifts':
      return 'Limit changes to small positional shifts only.'
    case 'minor-secondary-detail-changes':
      return 'Limit changes to minor secondary details.'
  }
}

function resolveCompactEnvironmentSentence(state: ImageRecreationFormState): string {
  switch (state.environmentEnhancement) {
    case 'match-reference-environment':
      return 'Do not push additional environment enhancement beyond the reference image.'
    case 'minimal':
      return 'Apply restrained realism cleanup only.'
    case 'moderate-realism-boost':
      return 'Apply a moderate realism boost.'
    case 'strong-realism-boost':
      return 'Apply a strong realism boost.'
  }
}

function buildCompactNegativeSentence(state: ImageRecreationFormState): string {
  const basePeopleRule = (() => {
    if (allowsAddedPeople(state)) {
      return 'Do not remove existing people.'
    }

    if (allowsPeopleReduction(state)) {
      return 'Remove only a small number of existing people, and do not add or replace anyone.'
    }

    if (removesAllPeople(state)) {
      return 'Do not add any people.'
    }

    if (allowsPeopleRecasting(state)) {
      return state.peoplePresence === 'no-people'
        ? 'Do not add any people.'
        : 'Only change people as needed to match the selected people presence.'
    }

    return state.peoplePresence === 'no-people'
      ? 'Do not add any people.'
      : 'Do not add, remove, or replace any people.'
  })()

  return joinSentences([
    basePeopleRule,
    'Do not add animals, vehicles, buildings, props, or other scene elements not present in the reference image.',
    'Remove CGI, painted, or illustrated qualities.',
    'If lighting changes create new or stronger shadows, keep their direction, softness, density, and falloff physically realistic.',
    'Avoid face distortion, oversharpening, fake HDR, and unnatural contrast.',
    hasVisiblePeopleLayer(state)
      ? 'Do not warp or hallucinate tiny background faces, heads, hands, or bodies. Keep small people proportional, low-detail, and believable.'
      : '',
  ])
}

function buildPeopleSpecificPrompt(state: ImageRecreationFormState): string {
  const peopleCanBeAdded = allowsAddedPeople(state)
  const peopleCanBeReduced = allowsPeopleReduction(state)
  const peopleAreRemoved = removesAllPeople(state)
  const peopleCanBeRecast = allowsPeopleRecasting(state)

  if (!state.referenceHasPeople && !peopleCanBeAdded && !peopleAreRemoved && !peopleCanBeRecast) {
    return joinSentences([
      'The reference image contains no visible people.',
      // Duplicate this hard rule because image models often hallucinate passersby
      // into empty landscapes, architecture, and travel scenes unless the ban is explicit twice.
      NO_PEOPLE_GUARDRAIL,
    ])
  }

  const crowdGuardrail =
    usesPeopleOverride(state)
      ? 'If crowd activity is present, reduced, or introduced, keep the density, spacing, and body language believable for the location without creating theatrical foreground characters.'
      : 'Preserve the fact that the scene contains a crowd, but do not invent a completely different crowd composition or turn background people into focal subjects unless the selected handling explicitly allows it.'

  const sceneSpecificCrowdPrompt = (() => {
    if (state.sceneCategory === 'tourist-landmark-sparse-people') {
      return 'Preserve the sense of occasional visitors without turning the image into a crowd scene.'
    }

    if (state.sceneCategory === 'tourist-landmark-crowd' && state.peoplePresence === 'spread-out-crowd') {
      return 'Preserve dispersed people across the scene while keeping the landmark or environment dominant.'
    }

    if (state.sceneCategory === 'tourist-landmark-crowd' && state.peoplePresence === 'dense-crowd') {
      return 'Preserve the crowd density as part of the real scene without inventing theatrical or exaggerated foreground characters.'
    }

    if (state.sceneCategory === 'city-street-scene') {
      return 'Keep the street population level faithful to the reference image instead of making the street feel emptier or busier than it was.'
    }

    return ''
  })()

  const crowdPrompt =
    state.peoplePresence === 'spread-out-crowd' || state.peoplePresence === 'dense-crowd'
      ? crowdGuardrail
      : ''

  // Keep crowd-specific language deliberately conservative so the model preserves
  // density and activity without promoting invented background people into stars.
  return joinSentences([
    peopleCanBeAdded
      ? 'Allow the human presence in the frame to be rebalanced naturally instead of locking the image to the original people count.'
      : peopleCanBeReduced
        ? 'Allow only a slight reduction in people count by removing a few existing people. Do not introduce any new people.'
      : peopleAreRemoved
        ? 'Remove all existing people from the frame and do not introduce any replacement people.'
      : peopleCanBeRecast
        ? state.peoplePresence === 'no-people'
          ? 'Do not preserve the original human presence. Remove people from the frame and let the selected people setting drive the final scene.'
          : 'Do not preserve the original people identities. Recast every visible person and let the selected people setting determine the target human presence in the frame.'
        : 'Preserve the original subject count unless the allowed-variation setting explicitly permits limited micro-adjustments for those same existing subjects.',
    resolvePeoplePresencePrompt(state),
    resolvePeopleHandlingPrompt(state),
    resolveCrowdCharacterPrompt(state),
    sceneSpecificCrowdPrompt,
    crowdPrompt,
    resolveHumanDetailIntegrityPrompt(state),
    peopleCanBeAdded
      ? 'Any added or reshuffled people should still feel integrated into the original scene instead of reading like staged insertions, and existing people should not be removed just to simplify the frame.'
      : peopleCanBeReduced
        ? 'Only remove a small number of existing people. Keep the remaining people consistent, believable, and naturally integrated, and do not replace them with new subjects.'
      : peopleAreRemoved
        ? 'If people are removed, keep the empty scene believable and avoid obvious traces of staged object removal, broken shadows, or synthetic cleanup artifacts.'
      : peopleCanBeRecast
        ? state.peoplePresence === 'no-people'
          ? 'If people are removed, keep the empty scene believable and avoid obvious traces of staged object removal or synthetic cleanup.'
          : 'Changed people should feel like natural occupants of the scene, with believable variation in styling, pose, spacing, and scene role rather than repeated clones or pasted-in extras.'
        : 'Background or secondary people must remain secondary unless the selected mode says otherwise.',
  ])
}

function resolvePreservationPrompt(state: ImageRecreationFormState): string {
  if (state.preservationStrength === 'match-reference-preservation') {
    return 'Do not add extra preservation pressure beyond the normal reference anchoring rules. Keep the image faithful to the source without forcing a stricter or looser preservation mode.'
  }

  if (!usesPeopleOverride(state)) {
    return PRESERVATION_STRENGTH_MAP[state.preservationStrength].prompt
  }

  if (allowsPeopleReduction(state)) {
    switch (state.preservationStrength) {
      case 'strict':
        return 'Preserve the scene structure, composition intent, and major environmental elements very closely, while allowing only a slight reduction in people count.'
      case 'balanced':
        return 'Preserve the core image faithfully while allowing a small reduction in people count through believable removals only.'
      case 'flexible':
        return 'Preserve the scene category and core subject while allowing restrained thinning of the existing people in frame.'
    }
  }

  if (removesAllPeople(state)) {
    switch (state.preservationStrength) {
      case 'strict':
        return 'Preserve the scene structure, composition intent, and major environmental elements very closely while removing all people from the frame.'
      case 'balanced':
        return 'Preserve the core image faithfully while allowing all people to be removed cleanly from the scene.'
      case 'flexible':
        return 'Preserve the scene category and core subject while allowing the frame to be cleared of all visible people.'
    }
  }

  if (allowsPeopleRecasting(state)) {
    switch (state.preservationStrength) {
      case 'strict':
        return 'Preserve the scene structure, composition intent, and major environmental elements very closely, while allowing the entire human cast to be recast to match the selected people setting.'
      case 'balanced':
        return 'Preserve the core image faithfully while allowing the people in frame to be fully recast and redistributed naturally.'
      case 'flexible':
        return 'Preserve the scene category and core subject while allowing broad reinterpretation of the human cast and minor surrounding details.'
    }
  }

  switch (state.preservationStrength) {
    case 'strict':
      return 'Preserve the scene structure, composition intent, and major environmental elements very closely, while allowing human presence to be rebalanced naturally.'
    case 'balanced':
      return 'Preserve the core image faithfully while allowing subtle natural variation, including plausible reshuffling or addition of people.'
    case 'flexible':
      return 'Preserve the scene category and core subject while allowing restrained reinterpretation of human presence and minor details.'
  }
}

function resolveAllowedVariationPrompt(state: ImageRecreationFormState): string {
  if (!usesPeopleOverride(state)) {
    return ALLOWED_VARIATION_MAP[state.allowedVariation].prompt
  }

  if (allowsPeopleReduction(state)) {
    switch (state.allowedVariation) {
      case 'no-variation':
        return 'Keep non-human changes minimal, but allow only a slight reduction in people count by removing a few existing people.'
      case 'small-environmental-cleanup':
        return 'Limit non-human changes to small environmental cleanup only, while allowing a few existing people to be removed cleanly.'
      case 'small-wardrobe-changes':
        return 'Allow only restrained wardrobe-detail changes for the remaining people after removing a few existing people. Do not add replacements.'
      case 'small-positional-shifts':
        return 'Allow a few existing people to be removed and gently rebalance the remaining people within believable positions.'
      case 'minor-secondary-detail-changes':
        return 'Keep non-human changes to minor secondary details while allowing only slight thinning of the existing people in frame.'
    }
  }

  if (removesAllPeople(state)) {
    switch (state.allowedVariation) {
      case 'no-variation':
        return 'Keep non-human changes minimal, but remove all people cleanly so the scene becomes convincingly people-free.'
      case 'small-environmental-cleanup':
        return 'Limit non-human changes to small environmental cleanup only, while removing all existing people cleanly from the frame.'
      case 'small-wardrobe-changes':
        return 'Ignore wardrobe preservation and focus instead on removing all people cleanly while keeping the environment believable and intact.'
      case 'small-positional-shifts':
        return 'Allow the frame to be cleared of all people cleanly while keeping the overall scene layout intact.'
      case 'minor-secondary-detail-changes':
        return 'Keep non-human changes to minor secondary details while removing all visible people from the frame.'
    }
  }

  if (allowsPeopleRecasting(state)) {
    if (state.peoplePresence === 'no-people') {
      switch (state.allowedVariation) {
        case 'no-variation':
          return 'Keep non-human changes minimal, but allow people to be removed cleanly so the scene becomes convincingly people-free.'
        case 'small-environmental-cleanup':
          return 'Limit non-human changes to small environmental cleanup only, while allowing existing people to be removed cleanly from the scene.'
        case 'small-wardrobe-changes':
          return 'Ignore wardrobe preservation and focus instead on removing people cleanly while keeping the environment believable and intact.'
        case 'small-positional-shifts':
          return 'Allow human presence to be cleared from the frame cleanly while keeping the overall scene layout intact.'
        case 'minor-secondary-detail-changes':
          return 'Keep non-human changes to minor secondary details while allowing the scene to become convincingly people-free.'
      }
    }

    switch (state.allowedVariation) {
      case 'no-variation':
        return 'Keep non-human changes minimal, but allow every visible person to be recast and redistributed naturally to fit the selected people setting.'
      case 'small-environmental-cleanup':
        return 'Limit non-human changes to small environmental cleanup only, while allowing the human cast to be fully recast and rearranged naturally.'
      case 'small-wardrobe-changes':
        return 'Allow full recasting and restyling of the people in frame, with believable wardrobe, pose, and appearance changes that still suit the location.'
      case 'small-positional-shifts':
        return 'Allow the people in frame to be fully recast and reshuffled into new believable positions while keeping the overall scene layout intact.'
      case 'minor-secondary-detail-changes':
        return 'Keep non-human changes to minor secondary details while allowing the entire human cast to be reinterpreted naturally.'
    }
  }

  switch (state.allowedVariation) {
    case 'no-variation':
      return 'Keep non-human changes minimal, but allow people to be reshuffled or added naturally when it helps the scene feel believable.'
    case 'small-environmental-cleanup':
      return 'Limit non-human changes to small environmental cleanup only, while allowing people to be reshuffled or added naturally in plausible ways.'
    case 'small-wardrobe-changes':
      return 'Allow restrained wardrobe variation and natural people redistribution, keeping clothing, styling, and scene behavior believable for the location.'
    case 'small-positional-shifts':
      return 'Allow people to be repositioned, rebalanced, or modestly expanded naturally within the frame without making them feel staged.'
    case 'minor-secondary-detail-changes':
      return 'Keep non-human changes to minor secondary details while allowing human presence to be rebalanced naturally.'
  }
}

function buildNegativeInstructions(state: ImageRecreationFormState): string {
  const peopleCanBeAdded = allowsAddedPeople(state)
  const peopleCanBeReduced = allowsPeopleReduction(state)
  const peopleAreRemoved = removesAllPeople(state)
  const peopleCanBeRecast = allowsPeopleRecasting(state)

  return joinSentences([
    peopleCanBeAdded
      ? 'Do not add animals, objects, vehicles, buildings, props, or scene elements that are not already present in the reference image. Added or reshuffled people are allowed only when they remain plausible, naturally integrated, and consistent with the scene.'
      : peopleCanBeReduced
        ? 'Do not add people, animals, objects, vehicles, buildings, props, or scene elements that are not already present in the reference image. If people are removed, remove only a small number of existing people and do not replace them with new subjects.'
      : peopleAreRemoved
        ? 'Do not add people, animals, objects, vehicles, buildings, props, or scene elements that are not already present in the reference image. Remove all existing people cleanly and do not replace them with new subjects.'
      : peopleCanBeRecast
        ? state.peoplePresence === 'no-people'
          ? 'Do not add people, animals, objects, vehicles, buildings, props, or scene elements that are not already present in the reference image.'
          : 'Do not add animals, objects, vehicles, buildings, props, or scene elements that are not already present in the reference image. Changed or replaced people are allowed only when the resulting human presence stays plausible, naturally integrated, and consistent with the selected people setting.'
      : 'Do not add people, animals, objects, vehicles, buildings, props, or scene elements that are not already present in the reference image.',
    'Do not change the scene category, replace the main subject with a different subject, or turn the location into a different type of place.',
    usesPerspectiveOverride(state)
      ? 'Do not fabricate a completely different scene layout, skyline, facade geometry, terrain structure, or subject staging just to force the selected shot perspective.'
      : '',
    !state.referenceHasPeople && !peopleCanBeAdded ? NO_PEOPLE_GUARDRAIL : '',
    'Remove all CGI, painted, or illustrated qualities.',
    'Do not distort faces, heads, eyes, noses, mouths, skin, or other human features. Keep facial proportions natural and anatomically believable.',
    'Do not over-enhance faces, heads, skin, or human features.',
    hasVisiblePeopleLayer(state)
      ? 'Do not hallucinate crisp facial detail on tiny or distant people. Keep small faces and human features soft, proportional, and believable instead of warped, cloned, melted, or over-sharpened.'
      : '',
    'If lighting is changed or intensified, any new shadows and highlights must stay coherent in direction, softness, density, contact, and falloff so the image still reads as one believable real photograph.',
    'Avoid over-sharpened textures, implausible HDR, fake detail, or unnatural contrast.',
    'Maintain realistic light, shadows, depth, atmosphere, and color.',
  ])
}

export function buildImageRecreationPrompt(
  state: ImageRecreationFormState,
): PromptBuildResult {
  const scene = SCENE_CATEGORY_MAP[state.sceneCategory]
  const camera = CAMERA_PRESET_MAP[state.cameraPreset]
  const lens = LENS_PRESET_MAP[state.lensPreset]
  const lighting = LIGHTING_MAP[state.lighting]
  const style = CAPTURE_STYLE_MAP[state.captureStyle]
  const shotPerspective = SHOT_PERSPECTIVE_MAP[state.shotPerspective]
  const filterLook = FILTER_LOOK_MAP[state.filterLook]
  const environmentEnhancement = ENVIRONMENT_ENHANCEMENT_MAP[state.environmentEnhancement]
  const peopleCanBeAdded = allowsAddedPeople(state)
  const peopleCanBeReduced = allowsPeopleReduction(state)
  const peopleAreRemoved = removesAllPeople(state)
  const peopleCanBeRecast = allowsPeopleRecasting(state)
  const sceneSpecificPrompt = buildSceneSpecificPrompt(state)

  const blocks: PromptBlock[] = [
    {
      id: 'reference-anchoring',
      title: 'Reference anchoring',
      text: joinSentences([
        'Use the uploaded reference image as the exact subject, composition base, and scene category.',
        'Treat the reference image as the source of truth for what exists in the frame, how the composition is arranged, and what kind of real-world scene is being depicted.',
        resolveReferencePeopleAnchorPrompt(state),
        resolvePerspectiveAnchorPrompt(state),
      ]),
    },
    {
      id: 'scene-preservation',
      title: 'Scene preservation rules',
      text: joinSentences([
        peopleCanBeAdded
          ? 'Preserve the original structure of the scene and the composition anchor, while allowing human presence to be rebalanced naturally when needed.'
          : peopleCanBeReduced
            ? 'Preserve the original structure of the scene and the composition anchor, while allowing only a slight reduction in people count.'
          : peopleAreRemoved
            ? 'Preserve the original structure of the scene and the composition anchor while removing all people from the frame.'
          : peopleCanBeRecast
            ? 'Preserve the original structure of the scene and the composition anchor, but allow the entire human cast to be reinterpreted to match the selected people setting naturally.'
          : 'Preserve the original structure of the scene and the original subject count.',
        scene.prompt,
        sceneSpecificPrompt,
        resolvePrimarySubjectPrompt(state),
        resolvePreservationPrompt(state),
        resolveCenteredCompositionPrompt(state),
      ]),
    },
    {
      id: 'people-preservation',
      title: 'People preservation / crowd rules',
      text: buildPeopleSpecificPrompt(state),
    },
    {
      id: 'camera-lens-realism',
      title: 'Camera and lens realism',
      text: joinSentences([
        `Recreate the image as a true-to-life photograph captured with ${camera.label} and ${lens.label}.`,
        camera.prompt,
        lens.prompt,
        usesPerspectiveOverride(state)
          ? `Shift the camera viewpoint toward ${shotPerspective.label.toLowerCase()} treatment while keeping the scene physically believable.`
          : '',
        shotPerspective.prompt,
        'Enhance realism through natural lens rendering, realistic dynamic range, lifelike color science, optical depth, atmospheric perspective, and believable environmental detail.',
      ]),
    },
    {
      id: 'lighting-description',
      title: 'Lighting description',
      text: joinSentences([
        resolveLightingLeadSentence(state),
        lighting.prompt,
        'Keep shadows, highlights, and atmospheric depth physically believable.',
        'If the lighting introduces stronger highlights or deeper shadowing, keep the shadow geometry, softness, density, bounce, and falloff natural to the scene.',
      ]),
    },
    {
      id: 'style-description',
      title: 'Style description',
      text: joinSentences([
        resolveStyleLeadSentence(state),
        style.prompt,
        filterLook.prompt,
      ]),
    },
    {
      id: 'environment-realism',
      title: 'Environment realism upgrades',
      text: joinSentences([
        environmentEnhancement.prompt,
        resolveAllowedVariationPrompt(state),
        peopleCanBeAdded
          ? 'Any added or reshuffled people must feel naturally integrated, plausible for the location, and believable in pose, spacing, and scene role.'
          : peopleCanBeReduced
            ? 'Any removed people should disappear cleanly, and the remaining people must still feel naturally integrated, plausible, and consistent with the original scene.'
          : peopleAreRemoved
            ? 'All removed people should disappear cleanly, and the remaining environment must still feel physically believable, coherent, and untouched by synthetic cleanup artifacts.'
          : peopleCanBeRecast
            ? 'Any changed or replaced people must feel naturally integrated, varied, and plausible for the location, with believable pose, spacing, styling, and crowd behavior.'
          : 'Any allowed variation must stay subordinate to the original scene and may never create subjects that were not already present in the reference image.',
      ]),
    },
  ]

  if (state.extraInstructions.trim()) {
    blocks.push({
      id: 'user-guidance',
      title: 'Additional guidance',
      // Extra instructions are intentionally subordinate to the preservation rules.
      // They can refine wording or emphasis, but they can never override the hard guardrails above.
      text: `Apply this additional guidance only when it does not conflict with the reference image or the preservation rules above: ${state.extraInstructions.trim()}`,
    })
  }

  blocks.push({
    id: 'negative-instructions',
    title: 'Negative instructions',
    text: buildNegativeInstructions(state),
  })

  const compactPromptSections = [
    joinSentences([
      'Use the uploaded reference image as the exact subject, composition base, and scene category.',
      resolveReferencePeopleAnchorPrompt(state),
      resolveCompactSceneSentence(state, scene.label, scene.prompt, sceneSpecificPrompt),
      resolveCompactPerspectiveSentence(state),
      resolveCompactPreservationSentence(state),
      state.centerMainSubject ? CENTER_MAIN_SUBJECT_PROMPT : '',
    ]),
    joinSentences([
      resolveCompactPeopleSentence(state),
      resolveCompactCrowdCharacterSentence(state),
      resolveCompactHumanDetailSentence(state),
    ]),
    joinSentences([
      state.captureStyle === 'match-reference-style'
        ? `Recreate it as a true-to-life photograph captured with ${camera.label} and ${lens.label}.`
        : `Recreate it as a true-to-life ${style.label.toLowerCase()} photograph captured with ${camera.label} and ${lens.label}.`,
      lighting.prompt,
      state.filterLook === 'neutral-no-filter' ? '' : filterLook.prompt,
      resolveCompactEnvironmentSentence(state),
      resolveCompactVariationSentence(state),
      'Keep light, shadows, depth, atmosphere, and color physically believable.',
      'Any new or intensified lighting should create realistic shadows and highlights with coherent direction, softness, density, and falloff.',
    ]),
    joinSentences([
      state.extraInstructions.trim()
        ? `Additional guidance: ${state.extraInstructions.trim()}.`
        : '',
      buildCompactNegativeSentence(state),
    ]),
  ].filter(Boolean)

  return {
    blocks,
    finalPrompt: compactPromptSections.join('\n\n'),
  }
}
