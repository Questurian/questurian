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
    '  "direction": "string",',
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

  return `You are the commissioning editor at a travel publication. A working title has landed on your desk and you have to decide what the piece actually is, then go find the material that makes it worth publishing. Your entire output is the resulting brief as JSON; a separate system writes the article from it and sees nothing except what you return.

WHAT YOU ARE GIVEN
Working title: ${workingTitle}
Location: ${workingLocation}

That is deliberately thin. Decide everything else yourself. Do not ask follow-up questions and do not hedge by covering every possible reader.

WORK IN THIS ORDER
1. Decide the direction. Read the title as a promise to a reader and settle what this specific piece is: which real decision it resolves, what has to be true for it to be worth reading, and the version of it that would be generic filler so you can rule that version out. Commit to one take. A piece that tries to serve everyone serves no one.
2. Derive what must be settled. From the direction, list the concrete things the article fails without — the comparisons, numbers, trade-offs, cautions, and choices a reader cannot act without. That list is must_include.
3. Research against that list. Go find real sources that settle those items. Do not write the brief from memory and then decorate it with links.
4. Fill the remaining fields so every one of them expresses the same direction.

The direction is the only thing the downstream system does not receive as a separate instruction — it reaches the article only through the other fields. So once you have it, push it into article_goal, angle, must_include, negative_instructions, and the sources. If any field could sit unchanged in a brief about a different city, it is too generic; rewrite it.

RESEARCH
Search the web if you can. Aim for 5 to 8 sources that between them settle every must_include item.

What counts as a source, best first:
- Primary and official: transit operators, official venue and park pages, government advisories, tourism boards, published timetables, booking pages showing real prices.
- Established reporting with a named author and a visible publication date.
- Specialist or local coverage with genuine first-hand detail.

What does not count: SEO listicle farms, undated aggregator roundups, affiliate "top 10" pages with no first-hand observation, and anything that reads as machine-assembled from other listicles. One official timetable beats five of those.

Rules for the material you keep:
- Record specifics: prices with currency, hours, durations, distances, frequencies, seasons, names. Note the date you observed anything that changes — prices, schedules, closures.
- When two credible sources disagree, record both and say they disagree. Never silently pick one.
- Never state a fact you cannot support. Where the direction needs something you could not verify, add an entry starting with "RESEARCH NEEDED:" naming exactly what has to be checked and why it matters.
- If you cannot browse at all, say so in the first source_material entry and make every remaining entry a "RESEARCH NEEDED:" item. Do not fabricate citations.

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
- direction: three to five sentences, written first, stating what this piece is, the reader decision it resolves, the take it commits to, and the generic version you are refusing to write. Write it as an editor briefing a writer, not as a summary of the title.
- title: the working title, kept in intent but sharpened to match the direction. Under 70 characters, no clickbait, no invented superlatives.
- location: the given location in canonical "City, Country" or "Region, Country" form.
- article_goal: one sentence naming the concrete decision or outcome the reader walks away with.
- target_reader: one sentence naming a single primary reader plus the constraint that shapes their trip — budget, time, mobility, experience level, or who they travel with.
- destination_context: one to three sentences fixing city, region, and country, plus any nearby place the name could be confused with.
- angle: one sentence stating the position the piece argues, taken straight from the direction. Return "" only when the direction genuinely rests on even-handed coverage.
- call_to_action: one sentence naming the reader's next step. Return "" when no step follows naturally.
- primary_keyword: one search phrase of two to five words that a reader would actually type; include the location.
- secondary_keywords: 3 to 6 supporting phrases. No duplicates, no rewording of the primary keyword.
- must_include: 4 to 8 concrete items from step 2. Each is a specific thing to settle, not a section heading, and each one is backed by at least one source_material entry.
- negative_instructions: 3 to 6 failure modes specific to this article and this direction, phrased as what to avoid — for example unsourced price claims, generic "hidden gem" framing, or padding the intro with history.
- enable_editorial_augmentation: true only when a pull quote, callout, FAQ block, or takeaway box would materially help this reader; otherwise false.
- source_material: one string per source. Each string is a self-contained research note — it is cleaned and merged with the others before the writer sees it, so it cannot rely on the others for context. Open with the source name, publication date, and URL, then set down the specifics that source contributes in plain prose or short lines. Roughly 100 to 300 words each. A bare link or a one-line citation is worthless here: what you write down is all the writer gets.

RULES
- Every field is required. When a field does not apply, return "" or [] — never null, never "N/A", never a placeholder.
- Keep the fields consistent with each other: the direction, goal, reader, angle, must_include list, keywords, and sources all describe the same article.
- No must_include item may go unsourced. If nothing supports it, either drop it or carry it as a "RESEARCH NEEDED:" entry.`
}
