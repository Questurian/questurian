import {
  ALLOWED_VARIATION_MAP,
  ASPECT_RATIO_MAP,
  CAMERA_PRESET_MAP,
  CAPTURE_STYLE_MAP,
  ENVIRONMENT_ENHANCEMENT_MAP,
  FILTER_LOOK_MAP,
  LENS_PRESET_MAP,
  LIGHTING_MAP,
  PEOPLE_HANDLING_MAP,
  PEOPLE_PRESENCE_MAP,
  PRESERVATION_STRENGTH_MAP,
  PRIMARY_SUBJECT_MAP,
  SCENE_CATEGORY_MAP,
} from './config'
import type { ImageRecreationFormState, PromptBlock, PromptBuildResult } from './types'

const NO_PEOPLE_GUARDRAIL =
  'Do not add any people. If no people are present in the reference image, the output must contain no people.'

function joinSentences(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
}

function resolvePrimarySubjectPrompt(state: ImageRecreationFormState): string {
  if (state.peoplePresence === 'no-people' && state.primarySubjectEmphasis === 'person-first') {
    return PRIMARY_SUBJECT_MAP['environment-first'].prompt
  }

  return PRIMARY_SUBJECT_MAP[state.primarySubjectEmphasis].prompt
}

function buildSceneSpecificPrompt(state: ImageRecreationFormState): string {
  switch (state.sceneCategory) {
    case 'landscape-only':
      return state.peoplePresence === 'no-people'
        ? 'Keep the scene rooted in terrain, atmosphere, scale, and natural light without any invented human activity.'
        : 'Keep terrain, atmosphere, and environmental scale dominant even if existing people remain in the frame.'
    case 'tourist-landmark-no-people':
      return state.peoplePresence === 'no-people'
        ? 'Keep the landmark clean and free of invented tourists, crowds, or passersby.'
        : 'Keep the landmark dominant and ensure any existing people remain clearly secondary to it.'
    case 'tourist-landmark-sparse-people':
      return 'Keep the landmark clearly dominant and preserve the believable feel of a lightly visited destination.'
    case 'tourist-landmark-crowd':
      return 'Keep the landmark or environment readable even when crowd activity is part of the real scene.'
    case 'city-street-scene':
      return 'Preserve whether the street feels empty, lightly populated, or crowded, matching the original urban rhythm.'
    default:
      return ''
  }
}

function buildPeopleSpecificPrompt(state: ImageRecreationFormState): string {
  if (state.peoplePresence === 'no-people') {
    return joinSentences([
      PEOPLE_PRESENCE_MAP[state.peoplePresence].prompt,
      // Duplicate this hard rule because image models often hallucinate passersby
      // into empty landscapes, architecture, and travel scenes unless the ban is explicit twice.
      NO_PEOPLE_GUARDRAIL,
    ])
  }

  const crowdGuardrail =
    'Preserve the fact that the scene contains a crowd, but do not invent a completely different crowd composition or turn background people into focal subjects unless the selected handling explicitly allows it.'

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
    'Preserve the original subject count unless the allowed-variation setting explicitly permits limited micro-adjustments for those same existing subjects.',
    PEOPLE_PRESENCE_MAP[state.peoplePresence].prompt,
    PEOPLE_HANDLING_MAP[state.peopleHandling].prompt,
    sceneSpecificCrowdPrompt,
    crowdPrompt,
    'Background or secondary people must remain secondary unless the selected mode says otherwise.',
  ])
}

function buildNegativeInstructions(state: ImageRecreationFormState): string {
  return joinSentences([
    'Do not add people, animals, objects, vehicles, buildings, props, or scene elements that are not already present in the reference image.',
    'Do not change the scene category, replace the main subject with a different subject, or turn the location into a different type of place.',
    state.aspectRatio === 'match-reference'
      ? ''
      : 'Do not invent new off-frame scenery, architecture, sky detail, people, or props just to satisfy the selected aspect ratio.',
    state.peoplePresence === 'no-people' ? NO_PEOPLE_GUARDRAIL : '',
    'Remove all CGI, painted, or illustrated qualities.',
    'Do not over-enhance faces, heads, skin, or human features.',
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
  const aspectRatio = ASPECT_RATIO_MAP[state.aspectRatio]
  const filterLook = FILTER_LOOK_MAP[state.filterLook]
  const preservation = PRESERVATION_STRENGTH_MAP[state.preservationStrength]
  const environmentEnhancement = ENVIRONMENT_ENHANCEMENT_MAP[state.environmentEnhancement]
  const allowedVariation = ALLOWED_VARIATION_MAP[state.allowedVariation]

  const blocks: PromptBlock[] = [
    {
      id: 'reference-anchoring',
      title: 'Reference anchoring',
      text: joinSentences([
        'Use the uploaded reference image as the exact subject, composition base, and scene category.',
        'Treat the reference image as the source of truth for what exists in the frame, how the composition is arranged, and what kind of real-world scene is being depicted.',
        'Match the original framing, perspective, spatial relationships, and composition intent before making any realism upgrades.',
        aspectRatio.prompt,
        state.aspectRatio === 'match-reference'
          ? ''
          : 'If reframing is necessary for the selected output ratio, do it conservatively and do not invent missing off-frame content.',
      ]),
    },
    {
      id: 'scene-preservation',
      title: 'Scene preservation rules',
      text: joinSentences([
        'Preserve the original structure of the scene and the original subject count.',
        scene.prompt,
        buildSceneSpecificPrompt(state),
        resolvePrimarySubjectPrompt(state),
        preservation.prompt,
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
        'Enhance realism through natural lens rendering, realistic dynamic range, lifelike color science, optical depth, atmospheric perspective, and believable environmental detail.',
      ]),
    },
    {
      id: 'lighting-description',
      title: 'Lighting description',
      text: joinSentences([
        `Render the scene with ${lighting.label.toLowerCase()} qualities.`,
        lighting.prompt,
        'Keep shadows, highlights, and atmospheric depth physically believable.',
      ]),
    },
    {
      id: 'style-description',
      title: 'Style description',
      text: joinSentences([
        `Keep the overall treatment grounded in ${style.label.toLowerCase()}.`,
        style.prompt,
        filterLook.prompt,
      ]),
    },
    {
      id: 'environment-realism',
      title: 'Environment realism upgrades',
      text: joinSentences([
        environmentEnhancement.prompt,
        allowedVariation.prompt,
        'Any allowed variation must stay subordinate to the original scene and may never create subjects that were not already present in the reference image.',
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

  return {
    blocks,
    finalPrompt: blocks.map((block) => block.text).join('\n\n'),
  }
}
