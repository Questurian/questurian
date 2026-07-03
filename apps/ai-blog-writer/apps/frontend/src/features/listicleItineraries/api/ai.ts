import {
  composeItineraryBriefWithAi,
  composeItineraryDayBlurbsWithAi,
  composeItineraryIntroWithAi,
  convertMarkdownToLexical,
  generateListicleContentWithAi,
  generateSeoMetadataWithAi,
  generateTitleWithAi,
  rewriteBlockWithAi
} from '../../staging/api'

export async function markdownToLexical(
  markdown: string
): Promise<Record<string, unknown>> {
  const result = await convertMarkdownToLexical(markdown)
  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to convert markdown to lexical')
  }
  return result.data as Record<string, unknown>
}

export {
  composeItineraryBriefWithAi,
  composeItineraryDayBlurbsWithAi,
  composeItineraryIntroWithAi,
  generateListicleContentWithAi,
  generateSeoMetadataWithAi,
  generateTitleWithAi,
  rewriteBlockWithAi
}
