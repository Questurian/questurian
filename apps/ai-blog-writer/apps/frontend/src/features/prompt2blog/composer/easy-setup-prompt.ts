import type {
  Prompt2BlogArticleTypeOption,
  Prompt2BlogInputOption,
  Prompt2BlogInputOptionsResponse,
} from '../api'
import {
  DEFAULT_PROMPT2BLOG_MODEL,
  DEFAULT_PROMPT2BLOG_WRITER_MODEL,
} from '../constants/prompt2blog.constants'

// Catalog blurbs are authored as markdown paragraphs; the prompt only needs
// enough of each to tell two neighbouring options apart.
const MAX_OPTION_SUMMARY_LENGTH = 180

function summarizeOption(...candidates: Array<string | undefined>): string {
  const text = candidates.find(candidate => candidate && candidate.trim()) || ''
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= MAX_OPTION_SUMMARY_LENGTH) return collapsed
  return `${collapsed.slice(0, MAX_OPTION_SUMMARY_LENGTH - 1).trimEnd()}…`
}

function formatArticleTypeCatalog(articleTypes: Prompt2BlogArticleTypeOption[]): string {
  return articleTypes
    .map((option) => {
      const definition = summarizeOption(option.definition)
      return definition ? `- ${option.name} — ${definition}` : `- ${option.name}`
    })
    .join('\n')
}

function formatIdCatalog(options: Prompt2BlogInputOption[], defaultId: string): string {
  return options
    .map((option) => {
      const summary = summarizeOption(option.description, option.instructions)
      const wordCount = option.target_word_count ? `~${option.target_word_count} words` : ''
      const details = [summary, wordCount].filter(Boolean).join(' · ')
      const isDefault = option.id === defaultId || (!defaultId && option.default)
      return [
        `- ${option.id} (${option.label})`,
        details ? ` — ${details}` : '',
        isDefault ? ' [house default]' : '',
      ].join('')
    })
    .join('\n')
}

export function buildEasySetupPrompt(
  title: string,
  location: string,
  inputOptions: Prompt2BlogInputOptionsResponse | null,
): string {
  const workingTitle = JSON.stringify(title.trim())
  const workingLocation = JSON.stringify(location.trim())

  const articleTypes = inputOptions?.article_types ?? []
  const tones = inputOptions?.tones ?? []
  const lengths = inputOptions?.lengths ?? []
  const brandVoices = inputOptions?.brand_voices ?? []

  // Only ask for a field when the allowed values can be stated. A catalog that
  // has not loaded would otherwise invite an invented value.
  const schemaLines = [
    '  "title": "string",',
    '  "location": "string",',
    articleTypes.length ? '  "article_type": "one name from the article_type list",' : '',
    '  "article_goal": "string",',
    '  "target_reader": "string",',
    '  "destination_context": "string",',
    '  "angle": "string",',
    '  "call_to_action": "string",',
    tones.length ? '  "tone_id": "one id from the tone_id list",' : '',
    lengths.length ? '  "length_id": "one id from the length_id list",' : '',
    brandVoices.length ? '  "brand_voice_id": "one id from the brand_voice_id list",' : '',
    '  "creativity_level": "low" | "medium" | "high",',
    '  "primary_keyword": "string",',
    '  "secondary_keywords": ["string", "…"],',
    '  "must_include": ["string", "…"],',
    '  "negative_instructions": ["string", "…"],',
    '  "enable_editorial_augmentation": true | false,',
    '  "source_material": ["string", "…"],',
    `  "model_name": ${JSON.stringify(DEFAULT_PROMPT2BLOG_MODEL)},`,
    `  "writing_model": ${JSON.stringify(DEFAULT_PROMPT2BLOG_WRITER_MODEL)}`,
  ].filter(Boolean).join('\n')

  const catalogs = [
    articleTypes.length
      ? `article_type — copy one name exactly:\n${formatArticleTypeCatalog(articleTypes)}`
      : '',
    tones.length
      ? `tone_id — copy one id exactly:\n${formatIdCatalog(tones, inputOptions?.defaults.tone_id ?? '')}`
      : '',
    lengths.length
      ? `length_id — copy one id exactly:\n${formatIdCatalog(lengths, inputOptions?.defaults.length_id ?? '')}`
      : '',
    brandVoices.length
      ? `brand_voice_id — copy one id exactly:\n${formatIdCatalog(brandVoices, inputOptions?.defaults.brand_voice_id ?? '')}`
      : '',
    'creativity_level — copy one id exactly:\n'
      + '- low — stick close to verifiable specifics; best for logistics, safety, and cost topics\n'
      + '- medium — specifics first, with room for scene-setting\n'
      + '- high — narrative and voice lead; best for inspiration and feature pieces',
  ].filter(Boolean).join('\n\n')

  return `Fill in the brief that a travel publication uses to commission one article. Your entire output is that brief as JSON; a separate system writes the article from it.

WHAT YOU ARE GIVEN
Working title: ${workingTitle}
Location: ${workingLocation}

Decide everything else yourself from those two inputs. Do not ask follow-up questions.

OUTPUT
One JSON object, nothing before or after it: no code fences, no commentary, no trailing notes. Every key appears exactly once, in this order, with this type:

{
${schemaLines}
}

ALLOWED VALUES
Copy the listed value exactly, character for character. Never return a value that is not on the list, and never invent a new option.

${catalogs}

model_name and writing_model are app settings rather than editorial choices, so copy the two values shown in the schema verbatim.

HOW TO FILL THE FREE-TEXT FIELDS
- title: the working title, kept in intent but sharpened for clarity. Under 70 characters, no clickbait, no invented superlatives.
- location: the given location in canonical "City, Country" or "Region, Country" form.
- article_goal: one sentence naming the concrete decision or outcome the reader walks away with.
- target_reader: one sentence naming a single primary reader plus the constraint that shapes their trip — budget, time, mobility, experience level, or who they travel with.
- destination_context: one to three sentences fixing city, region, and country, plus any nearby place the name could be confused with.
- angle: one sentence stating the editorial point of view. Return "" when even-handed coverage serves the reader better.
- call_to_action: one sentence naming the reader's next step. Return "" when no step follows naturally.
- primary_keyword: one search phrase of two to five words that a reader would actually type; include the location.
- secondary_keywords: 3 to 6 supporting phrases. No duplicates, no rewording of the primary keyword.
- must_include: 4 to 8 concrete topics, decisions, cautions, or comparisons this article fails without. Each is a specific thing, not a section heading.
- negative_instructions: 3 to 6 failure modes specific to this article, phrased as what to avoid — for example unsourced price claims, generic "hidden gem" framing, or padding the intro with history.
- enable_editorial_augmentation: true only when a pull quote, callout, FAQ block, or takeaway box would materially help this reader; otherwise false.
- source_material: one string per factual note. Include the source name and URL inside the string when you can browse. Never state a fact you cannot support — instead add a string starting with "RESEARCH NEEDED:" naming what has to be checked.

RULES
- Every field is required. When a field does not apply, return "" or [] — never null, never "N/A", never a placeholder.
- Keep the fields consistent with each other: the goal, reader, angle, must_include list, and keywords all describe the same article.`
}
