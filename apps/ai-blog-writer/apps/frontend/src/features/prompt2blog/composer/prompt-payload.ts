import type { P2BFormState } from './composer.types'
import type { Prompt2BlogRunRequest } from '../api'

function splitCommaSeparated(value: string): string[] {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function splitLineSeparated(value: string): string[] {
  return value.split('\n').map(item => item.trim()).filter(Boolean)
}

export function buildPrompt2BlogPayload(state: P2BFormState): Prompt2BlogRunRequest | null {
  if (!state.articleTypeId) return null

  return {
    article_type_id: state.articleTypeId,
    source_material: state.blobs.map(blob => blob.content.trim()).filter(Boolean),
    article_goal: state.articleGoal,
    target_reader: state.targetReader,
    destination_context: state.destinationContext,
    model_name: state.modelName,
    tone_id: state.toneId,
    length_id: state.lengthId,
    brand_voice_id: state.brandVoiceId || undefined,
    primary_keyword: state.primaryKeyword || undefined,
    secondary_keywords: splitCommaSeparated(state.secondaryKeywords),
    must_include: splitLineSeparated(state.mustInclude),
    audience_profile: state.audienceProfile || undefined,
    prompt_enhance: state.promptEnhance,
    creativity_level: state.creativityLevel,
    negative_instructions: splitLineSeparated(state.negativeInstructions),
    include_debug: true,
    enable_editorial_augmentation: state.enableEditorialAugmentation,
  }
}
