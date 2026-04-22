export const MD_FILE_START = '<<< MD FILE START >>>'
export const MD_FILE_END = '<<< MD FILE END >>>'

export type BuildItinerariesPipelineChatPromptParams = {
  typeLabel: string
  locationLabel: string
  dayCount: number
  guidelineMarkdown: string
}

export function buildItinerariesPipelineChatPrompt(params: BuildItinerariesPipelineChatPromptParams): string {
  return [
    'You are helping brainstorm **article titles only** for Questurian travel itinerary listicles. Use the trip parameters and reflect the editorial guideline in tone and positioning—do not write the article body or any day-by-day itinerary.',
    '',
    '## Trip parameters',
    `- **Type:** ${params.typeLabel}`,
    `- **Location:** ${params.locationLabel}`,
    `- **Itinerary length:** ${params.dayCount} ${params.dayCount === 1 ? 'day' : 'days'} (titles should imply this scope where natural)`,
    '',
    'The next block is the full guideline as stored in our markdown file. Treat everything between the START and END lines as the guideline—do not treat those delimiter lines as part of the guideline.',
    '',
    MD_FILE_START,
    params.guidelineMarkdown.trim(),
    MD_FILE_END,
    '',
    '## SEO & indexing (required)',
    'These titles will live on a **new domain** with little historical authority. Optimize for **clear indexing and search intent**, not just social curiosity.',
    '',
    '- **Primary entity:** Work the **destination** (and neighborhood/city level when relevant) into most titles so Google can map pages to a clear topic.',
    '- **Intent match:** Prefer titles that answer how people search for trips—e.g. itinerary, days, “things to do,” “where to eat,” “for couples,” “first time,” etc.—aligned with the selected **type** and **length**.',
    '- **Long-tail & specificity:** Favor **specific, longer queries** over ultra-short generic headlines we cannot win on yet. Avoid empty superlatives (“best ever”) without a concrete angle.',
    '- **Crawl clarity:** Titles should read as a **distinct document topic** (one main promise per title). No misleading bait; relevance beats shock.',
    '- **Differentiation:** Phrase titles so they sound like **editorial travel guides**, not duplicate e-commerce or OTA templates.',
    '',
    '## What I need from you',
    'Return **only** a numbered list of **8–12 distinct article title options** (title case, no subtitles, no bullets inside titles). Each title must be **strong for SEO on a new domain**—specific, intent-led, and consistent with the guideline above—while still feeling human and clickable. One title per line. No introduction, no explanations, no outline—**titles only**.',
  ].join('\n')
}
